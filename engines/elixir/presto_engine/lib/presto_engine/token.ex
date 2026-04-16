defmodule PrestoEngine.Token do
  @moduledoc """
  Stateless token signing and verification using HMAC-SHA256.
  Format: base64url(payload).base64url(hmac_sha256(base64url(payload), secret))
  """

  @default_ttl 3600

  def secret do
    Application.get_env(:presto_engine, :secret, "presto-dev-secret-change-me")
  end

  def sign(payload, opts \\ []) when is_map(payload) do
    ttl = Keyword.get(opts, :ttl, @default_ttl)
    payload = Map.put(payload, "exp", System.os_time(:second) + ttl)
    payload_b64 = payload |> Jason.encode!() |> Base.url_encode64(padding: false)
    sig = compute_sig(payload_b64)
    "#{payload_b64}.#{sig}"
  end

  def verify(token) when is_binary(token) do
    case String.split(token, ".", parts: 2) do
      [payload_b64, sig] ->
        expected_sig = compute_sig(payload_b64)

        if secure_compare(sig, expected_sig) do
          case Base.url_decode64(payload_b64, padding: false) do
            {:ok, json} ->
              case Jason.decode(json) do
                {:ok, payload} ->
                  exp = Map.get(payload, "exp", 0)

                  if exp > System.os_time(:second) do
                    {:ok, payload}
                  else
                    {:error, :expired}
                  end

                _ ->
                  {:error, :invalid}
              end

            _ ->
              {:error, :invalid}
          end
        else
          {:error, :invalid_signature}
        end

      _ ->
        {:error, :malformed}
    end
  end

  def sign_url(path, opts \\ []) do
    ttl = Keyword.get(opts, :ttl, @default_ttl)
    exp = System.os_time(:second) + ttl
    data = "#{path}:#{exp}"
    sig = :crypto.mac(:hmac, :sha256, secret(), data) |> Base.url_encode64(padding: false)
    "#{path}?sig=#{sig}&exp=#{exp}"
  end

  def verify_url(path, sig, exp) do
    exp_int = if is_binary(exp), do: String.to_integer(exp), else: exp

    if exp_int > System.os_time(:second) do
      data = "#{path}:#{exp_int}"
      expected = :crypto.mac(:hmac, :sha256, secret(), data) |> Base.url_encode64(padding: false)

      if secure_compare(sig, expected), do: :ok, else: {:error, :invalid_signature}
    else
      {:error, :expired}
    end
  end

  defp compute_sig(payload_b64) do
    :crypto.mac(:hmac, :sha256, secret(), payload_b64)
    |> Base.url_encode64(padding: false)
  end

  defp secure_compare(a, b) when is_binary(a) and is_binary(b) do
    Plug.Crypto.secure_compare(a, b)
  end
end
