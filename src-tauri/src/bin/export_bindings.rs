// Regenerates src/api/bindings.ts from the IPC-facing types.
// Run after adding/changing one: cargo run --bin export-bindings
fn main() {
    std::fs::write(
        "../src/api/bindings.ts",
        meander_lib::bindings::typescript(),
    )
    .expect("write bindings.ts");
    println!("wrote src/api/bindings.ts");
}
