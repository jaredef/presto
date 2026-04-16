defmodule PrestoEngine.Seed do
  @moduledoc """
  Seeds the SQLite database with demo data.
  """

  alias PrestoEngine.Adapters.SQLiteAdapter

  def run do
    SQLiteAdapter.execute("""
    CREATE TABLE IF NOT EXISTS post (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT,
      body TEXT,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Only seed if empty
    case SQLiteAdapter.query(%{type: "post", limit: 1}) do
      [] ->
        SQLiteAdapter.execute(
          "INSERT INTO post (title, slug, body, status) VALUES (?1, ?2, ?3, ?4)",
          ["First Post", "first-post", "This is the first post content.", "published"]
        )

        SQLiteAdapter.execute(
          "INSERT INTO post (title, slug, body, status) VALUES (?1, ?2, ?3, ?4)",
          ["Second Post", "second-post", "This is the second post content.", "published"]
        )

        SQLiteAdapter.execute(
          "INSERT INTO post (title, slug, body, status) VALUES (?1, ?2, ?3, ?4)",
          ["Third Post", "third-post", "This is the third post content.", "published"]
        )

      _ ->
        :ok
    end
  end
end
