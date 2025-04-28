# Tauri Plugin clerk

WIP

The platfrom agnostic Clerk FAPI in rust can be found from [here](https://github.com/TheGrowthEngineeringCompany/clerk-fapi-rs).

Goal here:
1. Implement the core [Clerk interface](https://github.com/clerk/javascript/blob/main/packages/types/src/clerk.ts#L115) in the quest js
2. attach the Clerk to `window.Clerk`
3. create all the methods of the clerk client as tauri commands

Idea here is that one would initialize the clerk in the rust side of Tauri and could access it from the
rust code via the store and from the JS side via the `window.Clerk`. This should allow using Clerk
with any of the JS clerk libs by pasing the custom Clerk into them.
