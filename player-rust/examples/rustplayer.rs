extern crate battlecode_hackathon;

use battlecode_hackathon::*;

fn run() -> Result<()> {
    let mut game = Game::new("rustplayer")?;

    loop {
        game.next_turn()?;

        // TODO split game into "game" and "state",
        // so that this workaround isn't necessary
        let mut actions = Vec::new();
        for (id, entity) in &game.entities {
            actions.push(Action::Move {
                id: *id,
                loc: Location {
                    x: entity.location.x + 1,
                    y: entity.location.y
                }
            });
        }
        for action in actions {
            game.queue(action);
        }
    }
}

fn main() {
    println!("rustplayer error: {}", run().unwrap_err());
}