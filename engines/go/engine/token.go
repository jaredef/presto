package engine

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

var b64 = base64.RawURLEncoding

func TokenSign(payload map[string]interface{}, secret string) (string, error) {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	payloadB64 := b64.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadB64))
	sigB64 := b64.EncodeToString(mac.Sum(nil))
	return payloadB64 + "." + sigB64, nil
}

func TokenVerify(token string, secret string) (map[string]interface{}, error) {
	parts := splitToken(token)
	if len(parts) != 2 {
		return nil, errors.New("invalid token format")
	}
	payloadB64, sigB64 := parts[0], parts[1]

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadB64))
	expectedSig := b64.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sigB64), []byte(expectedSig)) {
		return nil, errors.New("invalid signature")
	}

	payloadJSON, err := b64.DecodeString(payloadB64)
	if err != nil {
		return nil, err
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return nil, err
	}

	if exp, ok := payload["exp"].(float64); ok {
		if time.Now().Unix() > int64(exp) {
			return nil, errors.New("token expired")
		}
	}

	return payload, nil
}

func splitToken(token string) []string {
	idx := -1
	for i := len(token) - 1; i >= 0; i-- {
		if token[i] == '.' {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil
	}
	return []string{token[:idx], token[idx+1:]}
}

func GenerateActionToken(action, typeName, recordId, secret string) (string, error) {
	payload := map[string]interface{}{
		"action":   action,
		"type":     typeName,
		"recordId": recordId,
		"exp":      float64(time.Now().Add(1 * time.Hour).Unix()),
	}
	return TokenSign(payload, secret)
}

func GenerateChannelToken(sub, scope, secret string) (string, error) {
	jti, _ := generateJTI()
	payload := map[string]interface{}{
		"sub":   sub,
		"scope": scope,
		"exp":   float64(time.Now().Add(120 * time.Second).Unix()),
		"jti":   jti,
	}
	return TokenSign(payload, secret)
}

func generateJTI() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}

func SignURL(path, secret string) string {
	exp := time.Now().Add(1 * time.Hour).Unix()
	message := fmt.Sprintf("%s:%d", path, exp)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	sig := b64.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s?sig=%s&exp=%d", path, sig, exp)
}
