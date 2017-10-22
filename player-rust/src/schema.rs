pub type EntityID = u16;
pub type TeamID = u8;

#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Location {
    pub x: u32,
    pub y: u32,
}

#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all="lowercase")]
pub enum EntityType {
    Thrower,
    STATUE,
    HEDGE
}

#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize)]
pub enum MapTile {
    #[serde(rename="G")]
    Grass,
    #[serde(rename="D")]
    Dirt
}

#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Entity {
    pub id: EntityID,
    // note: this field is renamed because "type" is a keyword in rust
    #[serde(rename="type")]
    pub entity_type: EntityType,
    pub location: Location,
    pub team: TeamID,
    pub hp: u8,
    pub cooldown_end: Option<u32>,
    pub held_by: Option<EntityID>,
    pub holding: Option<EntityID>,
    pub holding_end: Option<u32>,
}

#[derive(PartialEq, Eq, Debug, Clone, Serialize, Deserialize)]
pub struct Map {
    pub height: u16,
    pub width: u16,
    /// Indexed as [y][x]
    pub tiles: Vec<Vec<MapTile>>,
}

#[derive(PartialEq, Eq, Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: TeamID,
    pub name: String,
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
#[serde(rename_all = "snake_case")]
pub enum CommandToServer {
    Login {
        name: String,
    },
    MakeTurn {
        turn: u32,
        actions: Vec<Action>,
    }
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
#[serde(rename_all = "snake_case")]
pub enum CommandToClient {
    LoginConfirm {
        name: String,
        id: TeamID,
    },
    Start {
        map: Map,
        teams: Vec<Team>,
    },
    NextTurn {
        turn: u32,
        changed: Vec<Entity>,
        dead: Vec<EntityID>,

        successful: Option<Vec<Action>>,
        failed: Option<Vec<Action>>,
        reasons: Option<Vec<String>>,

        next_team: TeamID,
        winner: Option<TeamID>,
    }
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "action")]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Move {
        id: EntityID,
        loc: Location,
    },
    Pickup {
        id: EntityID,
        pickupid: EntityID,
    },
    Throw {
        id: EntityID,
        loc: Location,
    },
    Build {
        id: EntityID,
        loc: Location,
    },
    Disintegrate {
        id: EntityID,
    }
}

#[cfg(test)]
mod tests {
    use serde_json;
    use super::*;

    #[test]
    fn test_deserialization() {
        let login: CommandToServer = serde_json::from_str(r#"
        {
            "command": "login",
            "name": "test"
        }
        "#).unwrap();

        assert_eq!(login, CommandToServer::Login { name: "test".into() });

        let make_turn: CommandToServer = serde_json::from_str(r#"
        {
            "command": "make_turn",
            "turn": 0,
            "actions": [
                {
                    "action": "move",
                    "id": 57,
                    "loc": {"x": 0, "y": 20}
                },
                {
                    "action": "pickup",
                    "id": 57,
                    "pickupid": 78
                },
                {
                    "action": "throw",
                    "id": 57,
                    "loc": {"x": 0, "y": 20}
                },
                {
                    "action": "build",
                    "id": 57,
                    "loc": {"x": 0, "y": 20}
                },
                {
                    "action": "disintegrate",
                    "id": 57
                }
            ]
        }
        "#).unwrap();

        assert_eq!(make_turn, CommandToServer::MakeTurn {
            turn: 0,
            actions: vec![
                Action::Move {
                    id: 57,
                    loc: Location {x: 0, y: 20}
                },
                Action::Pickup {
                    id: 57,
                    pickupid: 78
                },
                Action::Throw {
                    id: 57,
                    loc: Location {x: 0, y: 20}
                },
                Action::Build {
                    id: 57,
                    loc: Location {x: 0, y: 20}
                },
                Action::Disintegrate {
                    id: 57
                }
            ]
        });

        let login_confirm: CommandToClient = serde_json::from_str(r#"
            {
                "command": "login_confirm",
                "name": "test",
                "id": 0
            }
        "#).unwrap();
        assert_eq!(login_confirm, CommandToClient::LoginConfirm {
            name: "test".into(),
            id: 0
        });

        let start: CommandToClient = serde_json::from_str(r#"
        {
            "command": "start",
            "map": {
                "width": 2,
                "height": 2,
                "tiles": [["G","D"],["D","G"]]
            },
            "teams": [
                {
                    "id": 0,
                    "name": "test"
                }
            ]
        }
        "#).unwrap();
        assert_eq!(start, CommandToClient::Start {
            map: Map {
                width: 2,
                height: 2,
                tiles: vec![vec![MapTile::Grass, MapTile::Dirt],
                            vec![MapTile::Dirt, MapTile::Grass]]
            },
            teams: vec![
                Team {
                    id: 0,
                    name: "test".into()
                }
            ]
        });
        
        let next_turn: CommandToClient = serde_json::from_str(r#"
        {
            "command": "next_turn",
            "turn": 0,
            "changed": [{
                 "id": 0,
                 "type": "thrower",
                 "location": {"x": 0, "y": 0},
                 "team": 0,
                 "hp": 255,
                 "cooldown_end": 822,
                 "held_by": 3,
                 "holding": 5,
                 "holding_end": 993
            }],
            "dead": [1, 2],
            "successful": [{"action": "disintegrate", "id": 75}],
            "failed": [{"action":"disintegrate", "id": 2388}],
            "reasons": ["bot does not exist: 2388"],

            "next_team": 3,
            "winner": 7
        }
        "#).unwrap();

        assert_eq!(next_turn, CommandToClient::NextTurn {
            turn: 0,
            changed: vec![Entity {
                 id: 0,
                 entity_type: EntityType::Thrower,
                 location: Location {x: 0, y: 0},
                 team: 0,
                 hp: 255,
                 cooldown_end: Some(822),
                 held_by: Some(3),
                 holding: Some(5),
                 holding_end: Some(993)
            }],
            dead: vec![1, 2],
            successful: Some(vec![Action::Disintegrate {id: 75}]),
            failed: Some(vec![Action::Disintegrate {id: 2388}]),
            reasons: Some(vec!["bot does not exist: 2388".into()]),

            next_team: 3,
            winner: Some(7)
        });
    }
}