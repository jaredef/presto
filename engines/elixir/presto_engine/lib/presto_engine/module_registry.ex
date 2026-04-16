defmodule PrestoEngine.ModuleRegistry do
  @moduledoc """
  Module registry with manifest-based sandboxing.
  First-party modules get full access. Restricted modules get a proxy
  that drops undeclared registrations.
  Uses Agent for thread-safe shared mutable state.
  """

  use Agent

  defstruct middleware: [], context_providers: %{}, channel_handlers: %{}

  def start_link(_opts) do
    Agent.start_link(fn -> %__MODULE__{} end, name: __MODULE__)
  end

  def register_middleware(mw) do
    Agent.update(__MODULE__, fn state ->
      %{state | middleware: state.middleware ++ [mw]}
    end)
  end

  def register_context_provider(name, provider) do
    Agent.update(__MODULE__, fn state ->
      %{state | context_providers: Map.put(state.context_providers, name, provider)}
    end)
  end

  def register_channel_handler(handler) do
    module_name = handler.module()

    Agent.update(__MODULE__, fn state ->
      %{state | channel_handlers: Map.put(state.channel_handlers, module_name, handler)}
    end)
  end

  def get_middleware do
    Agent.get(__MODULE__, fn state -> state.middleware end)
  end

  def get_context_providers do
    Agent.get(__MODULE__, fn state -> state.context_providers end)
  end

  def get_channel_handler(module_name) do
    Agent.get(__MODULE__, fn state -> Map.get(state.channel_handlers, module_name) end)
  end

  def boot_module(module) do
    manifest = module.manifest()
    trust = Map.get(manifest, :trust, "restricted")

    registry =
      if trust == "first-party" do
        # Full access — real registry
        %{
          register_middleware: &register_middleware/1,
          register_context_provider: &register_context_provider/2,
          register_channel_handler: &register_channel_handler/1
        }
      else
        # Sandboxed — only declared capabilities
        declared_middleware = Map.get(manifest, :middleware, [])
        declared_providers = Map.get(manifest, :context_providers, [])
        declared_handlers = Map.get(manifest, :channel_handlers, [])

        %{
          register_middleware: fn mw ->
            if mw.name() in declared_middleware, do: register_middleware(mw)
          end,
          register_context_provider: fn name, provider ->
            if name in declared_providers, do: register_context_provider(name, provider)
          end,
          register_channel_handler: fn handler ->
            if handler.module() in declared_handlers, do: register_channel_handler(handler)
          end
        }
      end

    try do
      module.boot(registry)
    rescue
      e -> require Logger; Logger.error("Module #{module.name()} boot failed: #{inspect(e)}")
    end
  end
end
