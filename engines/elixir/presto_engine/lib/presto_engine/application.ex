defmodule PrestoEngine.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    port = Application.get_env(:presto_engine, :port, 4002)

    children = [
      {PrestoEngine.Adapters.SQLiteAdapter, [db_path: db_path()]},
      PrestoEngine.ModuleRegistry,
      {Plug.Cowboy, scheme: :http, plug: PrestoEngine.PlugRouter, options: [port: port]}
    ]

    opts = [strategy: :one_for_one, name: PrestoEngine.Supervisor]
    result = Supervisor.start_link(children, opts)

    # Seed database after startup
    PrestoEngine.Seed.run()

    # Boot demo module
    boot_modules()

    require Logger
    Logger.info("PRESTO Engine running on port #{port}")

    result
  end

  defp db_path do
    Application.get_env(:presto_engine, :db_path, "presto.db")
  end

  defp boot_modules do
    # Boot the demo channel module
    try do
      PrestoEngine.ModuleRegistry.boot_module(PrestoEngine.Modules.DemoModule)
    rescue
      _ -> :ok
    end
  end
end
