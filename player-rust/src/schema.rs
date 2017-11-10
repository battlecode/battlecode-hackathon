pub type EntityID = u16;
pub type TeamID = u8;
pub type GameID = String;
pub type PlayerKey = String;

#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Location {
    pub x: i32,
    pub y: i32,
}

#[derive(PartialEq, Eq, Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all="lowercase")]
pub enum EntityType {
    THROWER,
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
#[serde(rename_all="camelCase")]
pub struct EntityData {
    pub id: EntityID,
    // note: this field is renamed because "type" is a keyword in rust
    #[serde(rename="type")]
    pub entity_type: EntityType,
    pub location: Location,
    #[serde(rename="teamID")]
    pub team_id: TeamID,
    pub hp: u8,
    pub cooldown_end: Option<u32>,
    pub held_by: Option<EntityID>,
    pub holding: Option<EntityID>,
    pub holding_end: Option<u32>,
}

#[derive(PartialEq, Eq, Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct SectorData {
    top_left: Location,
    #[serde(rename="controllingTeamID")]
    controlling_team_id: TeamID
}

#[derive(PartialEq, Eq, Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct GameState {
    pub version: String,
    pub height: u16,
    pub width: u16,
    /// Indexed as [y][x]
    pub tiles: Vec<Vec<MapTile>>,
    pub sector_size: u16,
    pub entities: Vec<EntityData>,
    pub sectors: Vec<SectorData>
}

#[derive(PartialEq, Eq, Debug, Clone, Serialize, Deserialize)]
pub struct TeamData {
    pub id: TeamID,
    pub name: String,
    pub key: Option<PlayerKey>
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub enum CommandToClient {
    LoginConfirm {
        #[serde(rename="teamID")]
        game_id: GameID,

        name: String,
        #[serde(rename="teamID")]
        team_id: TeamID,
    },
    Start {
        #[serde(rename="teamID")]
        game_id: GameID,

        map: Map,
        teams: Vec<TeamData>,
    },
    #[serde(rename_all="camelCase")]
    NextTurn {
        #[serde(rename="teamID")]
        game_id: GameID,
        turn: u32,

        changed: Vec<EntityData>,
        dead: Vec<EntityID>,
        changed_sectors: Vec<SectorData>,

        #[serde(rename="lastTeamID")]
        last_team_id: TeamID,
        successful: Option<Vec<Action>>,
        failed: Option<Vec<Action>>,
        reasons: Option<Vec<String>>,

        #[serde(rename="nextTeamID")]
        next_team_id: TeamID,
        #[serde(rename="winnerID")]
        winner_id: Option<TeamID>,
    },
    Error {
        reason: String
    },
    Keyframe {
        state: GameState,
        teams: Vec<TeamData>
    }
}

#[derive(PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "action")]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Move {
        id: EntityID,
        dx: i8,
        dy: i8
    },
    Pickup {
        id: EntityID,
        pickupid: EntityID,
    },
    Throw {
        id: EntityID,
        dx: i8,
        dy: i8
    },
    Build {
        id: EntityID,
        dx: i8,
        dy: i8
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
            "command": "makeTurn",
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
                "command": "loginConfirm",
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
            "command": "nextTurn",
            "turn": 0,
            "changed": [{
                 "id": 0,
                 "type": "thrower",
                 "location": {"x": 0, "y": 0},
                 "team": 0,
                 "hp": 255,
                 "cooldownEnd": 822,
                 "heldBy": 3,
                 "holding": 5,
                 "holdingEnd": 993
            }],
            "dead": [1, 2],
            "successful": [{"action": "disintegrate", "id": 75}],
            "failed": [{"action":"disintegrate", "id": 2388}],
            "reasons": ["bot does not exist: 2388"],

            "nextTeam": 3,
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