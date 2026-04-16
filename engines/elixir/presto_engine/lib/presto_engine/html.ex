defmodule PrestoEngine.HTML do
  @moduledoc """
  HTML escaping. &<>" are escaped by default.
  """

  def escape(value) when is_binary(value) do
    value
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end

  def escape(value) when is_number(value), do: to_string(value)
  def escape(nil), do: ""
  def escape(value), do: escape(to_string(value))
end
