%{
  configs: [
    %{
      name: "default",
      files: %{
        included: ["lib/", "test/"],
        excluded: [~r"/_build/", ~r"/deps/"]
      },
      strict: true,
      checks: %{
        enabled: [
          {Credo.Check.Readability.Specs, []}
        ],
        disabled: [
          # The route macros put every handler in an anonymous function, so this
          # fires on the router for structure the framework dictates.
          {Credo.Check.Refactor.NegatedConditionsInUnless, []}
        ]
      }
    }
  ]
}
