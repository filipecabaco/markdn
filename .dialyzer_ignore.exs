[
  # Empty on purpose. Francis 0.3 compiled each `ws/2` handler into a generated
  # module ("nofile") and inlined it at three call sites, which Dialyzer reported
  # as unreachable patterns and this file used to skip. Francis 0.4 compiles the
  # handler inside the router itself, the warning is gone, and `list_unused_filters`
  # fails the build on a filter that no longer matches — so add entries here only
  # for a warning that actually occurs, scoped as narrowly as that one was.
]
