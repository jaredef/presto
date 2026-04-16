defmodule PrestoEngine.Resolvers.AuthConditionals do
  @moduledoc """
  Handles <htx:auth role="R">...</htx:auth> and <htx:unauth>...</htx:unauth>.
  Shows content based on authentication state and role.
  """

  @auth_pattern ~r/<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)<\/htx:auth>/
  @unauth_pattern ~r/<htx:unauth\s*>([\s\S]*?)<\/htx:unauth>/

  def resolve(html, context) do
    auth = Map.get(context, "auth") || Map.get(context, :auth)
    user = if auth, do: Map.get(auth, "user") || Map.get(auth, :user), else: nil
    is_authenticated = user != nil

    html
    |> resolve_auth(is_authenticated, user)
    |> resolve_unauth(is_authenticated)
  end

  defp resolve_auth(html, is_authenticated, user) do
    Regex.replace(@auth_pattern, html, fn _full, role, content ->
      cond do
        not is_authenticated ->
          ""

        role != nil and role != "" ->
          user_role = if user, do: Map.get(user, "role") || Map.get(user, :role), else: nil

          if user_role == role do
            content
          else
            ""
          end

        true ->
          content
      end
    end)
  end

  defp resolve_unauth(html, is_authenticated) do
    Regex.replace(@unauth_pattern, html, fn _full, content ->
      if is_authenticated, do: "", else: content
    end)
  end
end
