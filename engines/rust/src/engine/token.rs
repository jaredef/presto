use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub fn base64url_encode(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

pub fn base64url_decode(s: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD.decode(s).map_err(|e| e.to_string())
}

pub fn sign_token(payload: &Value, secret: &[u8]) -> String {
    let payload_json = serde_json::to_vec(payload).unwrap();
    let payload_b64 = base64url_encode(&payload_json);

    let mut mac = HmacSha256::new_from_slice(secret).expect("valid HMAC key");
    mac.update(payload_b64.as_bytes());
    let sig = mac.finalize().into_bytes();
    let sig_b64 = base64url_encode(&sig);

    format!("{}.{}", payload_b64, sig_b64)
}

pub fn verify_token(token: &str, secret: &[u8]) -> Result<Value, String> {
    let parts: Vec<&str> = token.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("invalid token format".to_string());
    }

    let payload_b64 = parts[0];
    let provided_sig = base64url_decode(parts[1])?;

    // Constant-time verification via hmac crate
    let mut mac = HmacSha256::new_from_slice(secret).expect("valid HMAC key");
    mac.update(payload_b64.as_bytes());
    mac.verify_slice(&provided_sig)
        .map_err(|_| "invalid signature".to_string())?;

    let payload_bytes = base64url_decode(payload_b64)?;
    let payload: Value =
        serde_json::from_slice(&payload_bytes).map_err(|e| format!("invalid payload: {}", e))?;

    // Check expiry
    if let Some(exp) = payload.get("exp").and_then(|v| v.as_u64()) {
        if exp < current_timestamp() {
            return Err("token expired".to_string());
        }
    }

    Ok(payload)
}

pub fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

pub fn sign_url(path: &str, exp: u64, secret: &[u8]) -> String {
    let data = format!("{}:{}", path, exp);
    let mut mac = HmacSha256::new_from_slice(secret).expect("valid HMAC key");
    mac.update(data.as_bytes());
    let sig = mac.finalize().into_bytes();
    let sig_b64 = base64url_encode(&sig);

    if path.contains('?') {
        format!("{}&sig={}&exp={}", path, sig_b64, exp)
    } else {
        format!("{}?sig={}&exp={}", path, sig_b64, exp)
    }
}
