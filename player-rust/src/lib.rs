#![feature(custom_attribute)]

// `error_chain!` can recurse deeply
#![recursion_limit = "1024"]

#[macro_use]
extern crate error_chain;
#[macro_use]
extern crate serde_derive;
extern crate serde;
extern crate serde_json;
extern crate fnv;

use std::io::prelude::*;
use std::io::{BufReader, BufWriter};
use std::net::{ TcpStream, SocketAddr };
use std::collections::HashMap;

use serde_json::StreamDeserializer;
use serde_json::de::IoRead;

mod schema;
use schema::{ CommandToClient, CommandToServer };
pub use schema::{ 
    Action, Entity, EntityID, EntityType, Location,
    Map, MapTile, Team, TeamID
};

/// Fancy rust magic to define all of the error types we'll need
mod errors {
    error_chain! {
        foreign_links {
            Io(::std::io::Error);
            Serial(::serde_json::Error);
            AddressParse(::std::net::AddrParseError);
        }
        errors {
            GameError(t: &'static str) {
                description("game error")
                display("game error: {}", t)
            }
            NoMoreCommands {}
        }
    }
}
pub use errors::*;

type FastHashMap<K,V> = 
    HashMap<K, V, std::hash::BuildHasherDefault<fnv::FnvHasher>>;

// slightly wacky types to deal with serde
type Incoming = StreamDeserializer<'static, IoRead<BufReader<TcpStream>>, CommandToClient>;
type Outgoing = BufWriter<TcpStream>;

pub struct Game {
    pub map: Map,
    pub entities: FastHashMap<EntityID, Entity>,
    pub team_id: TeamID,
    pub teams: Vec<Team>,

    queued_actions: Vec<Action>,

    incoming: Incoming,
    outgoing: Outgoing
}

impl Game {
    pub fn new(name: &str) -> Result<Game> {
        Game::new_with_address(name, "127.0.0.1:6172".parse()?)
    }

    pub fn new_with_address(name: &str, address: SocketAddr) -> Result<Game> {
        let incoming = TcpStream::connect(address)?;
        let outgoing = incoming.try_clone()?;

        let mut incoming = StreamDeserializer::new(IoRead::new(BufReader::new(incoming)));
        let mut outgoing = BufWriter::new(outgoing);

        write_command(CommandToServer::Login {
            name: name.into(),
        }, &mut outgoing)?;

        let resp = read_command(&mut incoming)?;

        let team_id = if let CommandToClient::LoginConfirm { id, ..} = resp {
            id
        } else {
            bail!(ErrorKind::GameError("unexpected command"));
        };

        let start = read_command(&mut incoming)?;

        if let CommandToClient::Start { map, teams } = start {
            let mut game = Game {
                team_id: team_id,
                teams: teams,
                entities: FastHashMap::default(),
                map: map,

                queued_actions: Vec::new(),

                incoming: incoming,
                outgoing: outgoing
            };
            game.wait_for_turn()?;
            Ok(game)
        } else {
            bail!(ErrorKind::GameError("unexpected command"));
        }
    }

    pub fn queue(&mut self, action: Action) {
        self.queued_actions.push(action);
    }

    pub fn next_turn(&mut self) -> Result<()> {
        self.submit_turn()?;
        self.wait_for_turn()
    }

    fn submit_turn(&mut self) -> Result<()> {
        let command = CommandToServer::MakeTurn {
            actions: self.queued_actions.drain(..).collect()
        };
        write_command(command, &mut self.outgoing)
    }

    fn wait_for_turn(&mut self) -> Result<()> {
        loop {
            let turn = read_command(&mut self.incoming)?;

            // TODO use all fields
            if let CommandToClient::NextTurn {
                changed,
                dead,
                successful: _successful,
                failed: _failed,
                reasons: _reasons,
                next_team,
                winner: _winner
            } = turn {
                for id in dead {
                    self.entities.remove(&id);
                }
                for entity in changed {
                    self.entities.insert(entity.id, entity);
                }
                if next_team == self.team_id {
                    return Ok(());
                }
            } else {
                bail!(ErrorKind::GameError("unexpected command"));
            }
        }
    }
}

pub fn read_command(incoming: &mut Incoming) -> Result<CommandToClient> {
    let next = incoming.next();
    if let Some(result) = next {
        Ok(result?)
    } else {
        bail!(ErrorKind::NoMoreCommands)
    }
}

fn write_command(command: CommandToServer, outgoing: &mut Outgoing) -> Result<()> {
    let value = serde_json::to_string(&command)?;
    outgoing.write_all(value.as_bytes())?;
    outgoing.write_all(b"\n")?;
    outgoing.flush()?;

    Ok(())
}