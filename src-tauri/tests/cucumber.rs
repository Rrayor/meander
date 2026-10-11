use cucumber::World;

#[derive(Debug, Default, World)]
struct MeanderWorld;

fn main() {
    futures::executor::block_on(MeanderWorld::run("tests/features"));
}
