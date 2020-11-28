import { path, testingAsserts as ta } from "./deps-test.ts";
import * as mod from "./mod.ts";

function testFilePath(relTestFileName: string): string {
  return path.join(
    path.relative(
      Deno.cwd(),
      path.dirname(path.fromFileUrl(import.meta.url)),
    ),
    relTestFileName,
  );
}

Deno.test(`filter invalid operations`, () => {
  const testFormSrc = JSON.parse(
    Deno.readTextFileSync(testFilePath("mod_test-source1.json")),
  );

  const removedValues: string[] = [];
  const mutations = mod.jsonPatchMutationsSupplier();
  const removeTopLevelValues = [
    "/code",
    "/PATH_DELIMITER",
    "/template",
    "/type",
  ];
  mutations.removeValues(...removeTopLevelValues);
  removedValues.push(...removeTopLevelValues);

  // these are not in the source, should be filtered out (/${q} is not valid, /items/X is valid)
  for (const q of ["Q002", "Q005"]) {
    const removeValues = [
      `/${q}/codingInstructions`,
      `/${q}/copyrightNotice`,
      `/${q}/BAD-dataType`,
      `/${q}/units`,
    ];
    removedValues.push(...removeValues);
    mutations.removeValues(...removeValues);
  }

  const patchOps = mutations.patchOps();
  const validOps = mod.filterInvalidOps(patchOps, testFormSrc);
  ta.assertEquals(patchOps.length, 12);
  ta.assertEquals(validOps.length, 4);
});

Deno.test(`remove JSON values`, () => {
  const testFormSrc = JSON.parse(
    Deno.readTextFileSync(testFilePath("mod_test-source1.json")),
    // deno-lint-ignore no-explicit-any
  ) as any;

  const mutations = mod.jsonPatchMutationsSupplier();
  const removeTopLevelValues = [
    "/code",
    "/PATH_DELIMITER",
    "/template",
    "/type",
  ];
  mutations.removeValues(...removeTopLevelValues);

  mod.buildArrayItemsJsonPatchOps(
    testFormSrc as Record<string, unknown>,
    "/items",
    (
      item: Record<string, unknown>,
      index: number,
      parent: mod.JsonPointer,
    ): mod.JsonPatchOp | mod.JsonPatchOps | undefined => {
      if (["Q002", "Q005"].find((q) => q == item.questionCode)) {
        const removeValues = [
          `${parent}/${index}/codingInstructions`,
          `${parent}/${index}/copyrightNotice`,
          `${parent}/${index}/dataType`,
          `${parent}/${index}/units`,
        ];
        return mutations.removeValues(...removeValues);
      }
      if (["Q006"].find((q) => q == item.questionCode)) {
        const removeValues = [
          `${parent}/${index}/dataType`,
          `${parent}/${index}/hideUnits`,
        ];
        return mutations.removeValues(...removeValues);
      }
      return undefined;
    },
  );

  ta.assert(testFormSrc.name); // this will remain
  ta.assert(testFormSrc.code); // this will be removed

  const patchOps = mutations.patchOps();
  const validPatchOps = mod.filterInvalidOps(patchOps, testFormSrc);
  ta.assertEquals(validPatchOps.length, patchOps.length);
  ta.assertEquals(validPatchOps.length, 14);

  const mutate = mod.jsonPatchMutator(testFormSrc, validPatchOps);
  const mutationResult = mutate();
  ta.assert(mod.isJsonMutationResult(mutationResult));
  ta.assert(mutationResult.mutated.name);
  ta.assert(!mutationResult.mutated.code);
});
