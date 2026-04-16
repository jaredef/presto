defmodule PrestoEngine.Pipeline do
  @moduledoc """
  22-stage htxlang resolution pipeline.

   1. Static file serving (handled by Plug)
   2. Channel API (handled by Plug router)
   3. Middleware chain execution
   4. Context provider injection
   5. Pre-layout template processors
   6. htx:include expansion
   7. htx:component resolution
   8. Page-level htx:script extraction → scriptCollector
   9. htx:let binding → data context
  10. htx:data → adapter query → data context
  11. htx:grant → credential materialization → data context
  12. htx:action → signed token → $actions in data context
  13. htx:auth / htx:unauth conditional rendering
  14. htx:each / htx:if control flow
  15. htx:v / {htx:} expression evaluation
  15b. Extract layout directive BEFORE stripping
  16. Strip remaining htx: directives (protect htx:raw blocks)
  17. Post-layout template processors
  18. Layout wrapping
  19. Post-layout pass (includes, auth, control flow in layout)
  20. Script injection
  21. Final expression pass
  22. Replace PRESTO:SCRIPT placeholders, strip htx:raw wrappers
  """

  alias PrestoEngine.Expression
  alias PrestoEngine.Resolvers.{
    IncludeResolver,
    ComponentResolver,
    DataResolver,
    ControlFlow,
    LayoutResolver,
    GrantResolver,
    MutationHandler,
    AuthConditionals
  }

  @let_pattern ~r/<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*\/>/
  @script_pattern ~r/<htx:script>([\s\S]*?)<\/htx:script>/
  @raw_protect ~r/<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/i
  @htx_directive_pattern ~r/<\/?htx:[^>]*\/?>/
  @script_placeholder_begin "<!--PRESTO:SCRIPT:BEGIN-->"
  @script_placeholder_end "<!--PRESTO:SCRIPT:END-->"

  defstruct [
    :template_file,
    :html,
    :context,
    :script_collector,
    :layout_directive,
    :adapter,
    :request,
    :is_hx_request
  ]

  def run(template_file, opts \\ []) do
    adapter = Keyword.get(opts, :adapter, PrestoEngine.Adapters.SQLiteAdapter)
    request = Keyword.get(opts, :request, %{})
    context = Keyword.get(opts, :context, %{})
    is_hx_request = Keyword.get(opts, :hx_request, false)

    case File.read(template_file) do
      {:ok, html} ->
        {:ok, collector} = Agent.start_link(fn -> [] end)

        state = %__MODULE__{
          template_file: template_file,
          html: html,
          context: context,
          script_collector: collector,
          layout_directive: :default,
          adapter: adapter,
          request: request,
          is_hx_request: is_hx_request
        }

        result =
          state
          |> stage_3_middleware()
          |> stage_4_context_providers()
          |> stage_5_pre_layout_processors()
          |> stage_6_includes()
          |> stage_7_components()
          |> stage_8_page_scripts()
          |> stage_9_let_bindings()
          |> stage_10_data()
          |> stage_11_grants()
          |> stage_12_actions()
          |> stage_13_auth()
          |> stage_14_control_flow()
          |> stage_15_expressions()
          |> stage_15b_extract_layout()
          |> stage_16_strip_directives()
          |> stage_17_post_layout_processors()
          |> stage_18_layout_wrap()
          |> stage_19_post_layout_pass()
          |> stage_20_script_injection()
          |> stage_21_final_expressions()
          |> stage_22_finalize()

        Agent.stop(collector)
        {:ok, result.html}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # Stage 3: Middleware chain
  defp stage_3_middleware(state) do
    middleware = PrestoEngine.ModuleRegistry.get_middleware()

    context =
      Enum.reduce(middleware, state.context, fn mw, ctx ->
        try do
          case mw.handle(state.request, fn -> ctx end) do
            result when is_map(result) -> Map.merge(ctx, result)
            _ -> ctx
          end
        rescue
          _ -> ctx
        end
      end)

    %{state | context: context}
  end

  # Stage 4: Context provider injection
  defp stage_4_context_providers(state) do
    providers = PrestoEngine.ModuleRegistry.get_context_providers()

    context =
      Enum.reduce(providers, state.context, fn {name, provider}, ctx ->
        try do
          result = provider.resolve(state.request)
          Map.put(ctx, name, result)
        rescue
          _ -> ctx
        end
      end)

    %{state | context: context}
  end

  # Stage 5: Pre-layout template processors (extensibility point)
  defp stage_5_pre_layout_processors(state), do: state

  # Stage 6: Include expansion
  defp stage_6_includes(state) do
    html = IncludeResolver.resolve(state.html, state.template_file)
    %{state | html: html}
  end

  # Stage 7: Component resolution
  defp stage_7_components(state) do
    html = ComponentResolver.resolve(state.html, state.template_file, state.script_collector)
    %{state | html: html}
  end

  # Stage 8: Page-level htx:script extraction
  defp stage_8_page_scripts(state) do
    scripts = Regex.scan(@script_pattern, state.html) |> Enum.map(fn [_, body] -> body end)
    html = Regex.replace(@script_pattern, state.html, "")

    Enum.each(scripts, fn body ->
      script_tag = "<script>#{String.trim(body)}</script>"
      Agent.update(state.script_collector, fn s -> [script_tag | s] end)
    end)

    %{state | html: html}
  end

  # Stage 9: htx:let binding
  defp stage_9_let_bindings(state) do
    matches = Regex.scan(@let_pattern, state.html)

    context =
      Enum.reduce(matches, state.context, fn [_, name, value], ctx ->
        Map.put(ctx, name, value)
      end)

    html = Regex.replace(@let_pattern, state.html, "")
    %{state | html: html, context: context}
  end

  # Stage 10: htx:data resolution
  defp stage_10_data(state) do
    {html, context} = DataResolver.resolve(state.html, state.context, state.adapter)
    %{state | html: html, context: context}
  end

  # Stage 11: htx:grant
  defp stage_11_grants(state) do
    {html, context} = GrantResolver.resolve(state.html, state.context)
    %{state | html: html, context: context}
  end

  # Stage 12: htx:action
  defp stage_12_actions(state) do
    {html, context} = MutationHandler.prepare(state.html, state.context)
    %{state | html: html, context: context}
  end

  # Stage 13: auth/unauth conditionals
  defp stage_13_auth(state) do
    html = AuthConditionals.resolve(state.html, state.context)
    %{state | html: html}
  end

  # Stage 14: Control flow (each/if)
  defp stage_14_control_flow(state) do
    html = ControlFlow.resolve(state.html, state.context)
    %{state | html: html}
  end

  # Stage 15: Expression evaluation
  defp stage_15_expressions(state) do
    html = Expression.evaluate(state.html, state.context)
    %{state | html: html}
  end

  # Stage 15b: Extract layout directive BEFORE stripping
  defp stage_15b_extract_layout(state) do
    layout_directive = LayoutResolver.extract_layout_directive(state.html)
    %{state | layout_directive: layout_directive}
  end

  # Stage 16: Strip remaining htx: directives (protect htx:raw blocks)
  defp stage_16_strip_directives(state) do
    html = state.html

    # Protect htx:raw blocks
    {html, raw_markers} = protect_raw_blocks(html)

    # Strip layout directive
    html = LayoutResolver.strip_layout_directive(html)

    # Strip all remaining htx: directives
    html = Regex.replace(@htx_directive_pattern, html, "")

    # Restore raw blocks
    html = restore_raw_blocks(html, raw_markers)

    %{state | html: html}
  end

  # Stage 17: Post-layout template processors (extensibility point)
  defp stage_17_post_layout_processors(state), do: state

  # Stage 18: Layout wrapping
  defp stage_18_layout_wrap(state) do
    html = LayoutResolver.wrap(
      state.html,
      state.template_file,
      state.layout_directive,
      hx_request: state.is_hx_request
    )
    %{state | html: html}
  end

  # Stage 19: Post-layout pass (resolve directives in layout content)
  defp stage_19_post_layout_pass(state) do
    html = state.html
    |> AuthConditionals.resolve(state.context)
    |> ControlFlow.resolve(state.context)
    |> Expression.evaluate(state.context)
    %{state | html: html}
  end

  # Stage 20: Script injection
  defp stage_20_script_injection(state) do
    scripts = Agent.get(state.script_collector, fn s -> Enum.reverse(s) end)

    html =
      if scripts != [] do
        script_block = Enum.join(scripts, "\n")

        # Convert htx:script content to PRESTO:SCRIPT markers for stage 22
        script_block = String.replace(script_block, "<script", "#{@script_placeholder_begin}<PRESTO:SCRIPT")
        script_block = String.replace(script_block, "</script>", "</PRESTO:SCRIPT>#{@script_placeholder_end}")

        # Inject before </body>
        case String.split(state.html, "</body>", parts: 2) do
          [before, after_body] ->
            before <> "\n" <> script_block <> "\n</body>" <> after_body

          _ ->
            state.html <> "\n" <> script_block
        end
      else
        state.html
      end

    %{state | html: html}
  end

  # Stage 21: Final expression pass (evaluate expressions in injected scripts)
  defp stage_21_final_expressions(state) do
    html = Expression.evaluate(state.html, state.context)
    %{state | html: html}
  end

  # Stage 22: Replace PRESTO:SCRIPT placeholders with <script>, strip htx:raw wrappers
  defp stage_22_finalize(state) do
    html = state.html
    |> String.replace(@script_placeholder_begin, "")
    |> String.replace(@script_placeholder_end, "")
    |> String.replace("<PRESTO:SCRIPT", "<script")
    |> String.replace("</PRESTO:SCRIPT>", "</script>")
    |> strip_raw_wrappers()

    %{state | html: html}
  end

  defp strip_raw_wrappers(html) do
    html
    |> String.replace(~r/<htx:raw(?:\s[^>]*)?>/i, "")
    |> String.replace(~r/<\/htx:raw>/i, "")
  end

  defp protect_raw_blocks(html) do
    protect_pattern(html, @raw_protect, "RAWBLOCK", [])
  end

  defp protect_pattern(html, pattern, prefix, acc) do
    case Regex.run(pattern, html, return: :index) do
      [{start, len}] ->
        marker = "___PRESTO_#{prefix}_#{:erlang.unique_integer([:positive])}___"
        block = String.slice(html, start, len)
        new_html = String.slice(html, 0, start) <> marker <> String.slice(html, start + len, String.length(html))
        protect_pattern(new_html, pattern, prefix, [{marker, block} | acc])

      _ ->
        {html, acc}
    end
  end

  defp restore_raw_blocks(html, markers) do
    Enum.reduce(markers, html, fn {marker, block}, acc ->
      String.replace(acc, marker, block)
    end)
  end
end
