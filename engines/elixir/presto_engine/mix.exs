defmodule PrestoEngine.MixProject do
  use Mix.Project

  def project do
    [
      app: :presto_engine,
      version: "0.1.0",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger, :crypto],
      mod: {PrestoEngine.Application, []}
    ]
  end

  defp deps do
    [
      {:plug_cowboy, "~> 2.7"},
      {:plug, "~> 1.16"},
      {:jason, "~> 1.4"},
      {:exqlite, "~> 0.27"}
    ]
  end
end
