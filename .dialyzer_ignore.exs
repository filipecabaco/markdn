[
  # Francis's `ws/2` macro compiles the handler into a generated module (with no
  # source file, hence "nofile") and inlines the *same* multi-clause anonymous
  # function at three different call sites: `handle_in` calls it with
  # `{:received, _}`, `handle_info` with `:join`, and `terminate` with
  # `{:close, _}`. At each site the other two clauses are unreachable, which
  # Dialyzer reports as a pattern that can never match.
  #
  # This is inherent to the macro's design, not a defect in the handler — all
  # three clauses do run. Verified: the join reply and the MCP-write broadcast
  # both arrive at a live browser client. Narrowly scoped to `nofile` so a real
  # pattern_match in lib/ still fails the build.
  {"nofile", :pattern_match}
]
