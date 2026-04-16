defmodule PrestoEngine.Adapters.SQLiteAdapter do
  @moduledoc """
  ContentAdapter implementation using Exqlite for SQLite.
  Thread-safe via serialized access through GenServer.
  """

  use GenServer

  # Client API

  def start_link(opts) do
    db_path = Keyword.get(opts, :db_path, "presto.db")
    GenServer.start_link(__MODULE__, db_path, name: __MODULE__)
  end

  def query(params), do: GenServer.call(__MODULE__, {:query, params})
  def get(type, identifier), do: GenServer.call(__MODULE__, {:get, type, identifier})
  def create(type, data), do: GenServer.call(__MODULE__, {:create, type, data})
  def update(type, id, data), do: GenServer.call(__MODULE__, {:update, type, id, data})
  def delete(type, id), do: GenServer.call(__MODULE__, {:delete, type, id})
  def execute(sql, params \\ []), do: GenServer.call(__MODULE__, {:execute, sql, params})

  # Server callbacks

  @impl true
  def init(db_path) do
    {:ok, conn} = Exqlite.Sqlite3.open(db_path)
    Exqlite.Sqlite3.execute(conn, "PRAGMA journal_mode=WAL")
    Exqlite.Sqlite3.execute(conn, "PRAGMA foreign_keys=ON")
    {:ok, %{conn: conn, db_path: db_path}}
  end

  @impl true
  def handle_call({:query, params}, _from, state) do
    type = Map.get(params, :type)
    table = sanitize_table(type)
    where = Map.get(params, :where)
    order = Map.get(params, :order)
    limit = Map.get(params, :limit)
    offset = Map.get(params, :offset)

    sql = "SELECT * FROM #{table}"
    sql = if where, do: sql <> " WHERE #{where}", else: sql
    sql = if order, do: sql <> " ORDER BY #{order}", else: sql
    sql = if limit, do: sql <> " LIMIT #{limit}", else: sql
    sql = if offset, do: sql <> " OFFSET #{offset}", else: sql

    result = query_all(state.conn, sql)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:get, type, identifier}, _from, state) do
    table = sanitize_table(type)

    {sql, params} =
      cond do
        is_map(identifier) and Map.has_key?(identifier, "slug") ->
          {"SELECT * FROM #{table} WHERE slug = ?1", [Map.get(identifier, "slug")]}

        is_map(identifier) and Map.has_key?(identifier, "id") ->
          {"SELECT * FROM #{table} WHERE id = ?1", [Map.get(identifier, "id")]}

        true ->
          {"SELECT * FROM #{table} WHERE id = ?1 OR slug = ?1", [to_string(identifier)]}
      end

    result = query_one(state.conn, sql, params)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:create, type, data}, _from, state) do
    table = sanitize_table(type)
    keys = Map.keys(data) |> Enum.map(&to_string/1)
    placeholders = Enum.with_index(keys, 1) |> Enum.map(fn {_, i} -> "?#{i}" end) |> Enum.join(", ")
    columns = Enum.join(keys, ", ")
    values = Enum.map(keys, fn k -> Map.get(data, k) || Map.get(data, String.to_atom(k)) end)

    sql = "INSERT INTO #{table} (#{columns}) VALUES (#{placeholders})"
    exec_stmt(state.conn, sql, values)

    # Return the created record
    {:ok, stmt} = Exqlite.Sqlite3.prepare(state.conn, "SELECT * FROM #{table} WHERE rowid = last_insert_rowid()")
    result = fetch_row_as_map(state.conn, stmt)
    Exqlite.Sqlite3.release(state.conn, stmt)

    {:reply, result, state}
  end

  @impl true
  def handle_call({:update, type, id, data}, _from, state) do
    table = sanitize_table(type)
    keys = Map.keys(data) |> Enum.map(&to_string/1)
    set_clause = Enum.with_index(keys, 1) |> Enum.map(fn {k, i} -> "#{k} = ?#{i}" end) |> Enum.join(", ")
    values = Enum.map(keys, fn k -> Map.get(data, k) || Map.get(data, String.to_atom(k)) end)
    values = values ++ [id]

    sql = "UPDATE #{table} SET #{set_clause} WHERE id = ?#{length(keys) + 1}"
    exec_stmt(state.conn, sql, values)
    {:reply, true, state}
  end

  @impl true
  def handle_call({:delete, type, id}, _from, state) do
    table = sanitize_table(type)
    exec_stmt(state.conn, "DELETE FROM #{table} WHERE id = ?1", [id])
    {:reply, true, state}
  end

  @impl true
  def handle_call({:execute, sql, params}, _from, state) do
    result = exec_stmt(state.conn, sql, params)
    {:reply, result, state}
  end

  # Helpers

  defp sanitize_table(name) do
    # Simple sanitization — only allow word characters
    name
    |> to_string()
    |> String.replace(~r/[^\w]/, "")
  end

  defp query_all(conn, sql) do
    {:ok, stmt} = Exqlite.Sqlite3.prepare(conn, sql)
    columns = get_columns(conn, stmt)
    rows = fetch_all_rows(conn, stmt, columns, [])
    Exqlite.Sqlite3.release(conn, stmt)
    rows
  end

  defp query_one(conn, sql, params) do
    {:ok, stmt} = Exqlite.Sqlite3.prepare(conn, sql)
    bind_params(conn, stmt, params)
    result = fetch_row_as_map(conn, stmt)
    Exqlite.Sqlite3.release(conn, stmt)
    result
  end

  defp exec_stmt(conn, sql, params) do
    {:ok, stmt} = Exqlite.Sqlite3.prepare(conn, sql)
    bind_params(conn, stmt, params)
    result = Exqlite.Sqlite3.step(conn, stmt)
    Exqlite.Sqlite3.release(conn, stmt)
    result
  end

  defp bind_params(_conn, stmt, []), do: :ok = Exqlite.Sqlite3.bind(stmt, [])
  defp bind_params(_conn, stmt, params) do
    :ok = Exqlite.Sqlite3.bind(stmt, params)
  end

  defp get_columns(conn, stmt) do
    {:ok, cols} = Exqlite.Sqlite3.columns(conn, stmt)
    cols
  end

  defp fetch_all_rows(conn, stmt, columns, acc) do
    case Exqlite.Sqlite3.step(conn, stmt) do
      {:row, values} ->
        row = Enum.zip(columns, values) |> Map.new()
        fetch_all_rows(conn, stmt, columns, acc ++ [row])

      :done ->
        acc
    end
  end

  defp fetch_row_as_map(conn, stmt) do
    columns = get_columns(conn, stmt)

    case Exqlite.Sqlite3.step(conn, stmt) do
      {:row, values} ->
        Enum.zip(columns, values) |> Map.new()

      :done ->
        nil
    end
  end
end
