defmodule PrestoEngine.Modules.DemoModule do
  @moduledoc """
  Demo first-party module that registers a channel handler.
  """

  def name, do: "demo"

  def manifest do
    %{
      trust: "first-party",
      channelHandlers: ["demo"],
      middleware: [],
      contextProviders: []
    }
  end

  def boot(registry) do
    registry.register_channel_handler.(PrestoEngine.Modules.DemoChannelHandler)
  end
end

defmodule PrestoEngine.Modules.DemoChannelHandler do
  @moduledoc """
  Demo channel handler that responds to channel API requests.
  """

  def module, do: "demo"

  def handle(sub_path, _query, user_id, %{method: method, body: _body}) do
    %{
      status: 200,
      data: %{
        path: sub_path,
        user: user_id,
        method: method,
        message: "Hello from demo channel"
      }
    }
  end
end
