use cucumber::{given, then, when, World};

#[derive(Debug, Default, World)]
struct MeanderWorld {
    answer: Option<String>,
}

#[given("the application core")]
fn application_core(_world: &mut MeanderWorld) {}

#[when("I request a health check")]
fn request_health_check(world: &mut MeanderWorld) {
    world.answer = Some(meander_lib::health().to_string());
}

#[then(expr = "the answer is {string}")]
fn the_answer_is(world: &mut MeanderWorld, expected: String) {
    assert_eq!(world.answer.as_deref(), Some(expected.trim_matches('"')));
}

fn main() {
    futures::executor::block_on(MeanderWorld::run("tests/features"));
}
