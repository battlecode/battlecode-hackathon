import { IncomingCommand, LoginConfirm, OutgoingCommand, TeamData, TeamID, WorldData } from './schema';
import { Game, TurnDiff } from './game';
import * as net from 'net';
import * as byline from 'byline';

interface StateSetup {
    state: "setup",
    players: net.Socket[],
    listeners: net.Socket[],
    teamNames: string[]
}

interface StatePlay {
    state: "play",
    players: net.Socket[],
    listeners: net.Socket[],
    game: Game
}

type State = StateSetup | StatePlay;

var state: State = {
    state: "setup",
    listeners: [],
    players: [],
    teamNames: []
}

function contains(array: any[], thing): boolean {
    return array.indexOf(thing) !== -1;
}

function broadcast(message: OutgoingCommand) {
    var messageString = JSON.stringify(message);
    for (var listener of state.listeners) {
        listener.write(messageString);
        listener.write('\n');
    }
}

function handleDiff(diff: TurnDiff) {
    broadcast({
        command: "nextturn",
        changed: diff.dirty,
        dead: diff.dead,

        successful: diff.successfulActions,
        failed: diff.failedActions,
        reasons: diff.reasons,

        nextTeam: (state as StatePlay).game.nextTeam
    });
}

var server = new net.Server((socket) => {
    var socket_byline = byline(socket);
    state.listeners.push(socket);

    socket_byline.on('data', (data) => {
        var command = JSON.parse(data.toString()) as IncomingCommand;
        console.log(JSON.stringify(command));
        if (state.state == "setup" && command.command == "login") {
            if (contains(state.players, socket)) {
                throw new Error("already logged in!");
            }

            state.teamNames.push(command.name);
            state.players.push(socket);

            var confirmation: LoginConfirm = {
                command: "login_confirm",
                name: command.name,
                id: state.teamNames.length - 1
            };

            socket.write(JSON.stringify(confirmation));
            socket.write('\n');

            if (state.teamNames.length == 2) {
                console.log('game is starting now in theory');
                startGame();
            }
        } else if (state.state == "play" && command.command == "maketurn") {
            var team = state.players.indexOf(socket);
            if (team !== state.game.nextTeam) {
                throw new Error("wrong team moved");
            }

            var diff = state.game.makeTurn(team, command.actions);
            handleDiff(diff);
        }
    });
    socket_byline.on('close', () => {
        throw new Error("SOCKETS CANT CLOSE");
    });
    
});

function startGame() {
    var loginState = state as StateSetup;
    var world: WorldData = {
        height: 3,
        width: 3,
        tiles: [
            ['D', 'G', 'G'],
            ['G', 'D', 'G'],
            ['G', 'G', 'D']
        ]
    };
    var teams: TeamData[] = [];
    for (var id = 0; id < loginState.teamNames.length; id++) {
        teams.push({
            id: id,
            name: loginState.teamNames[id]
        });
    }
    broadcast({
        command: "start",
        world: world,
        teams: teams
    });
    state = {
        state: "play",
        players: loginState.players,
        listeners: loginState.listeners,
        game: new Game(world, teams)
    };

    var diff = state.game.addInitialEntities([
        {id: 0, type: "thrower", location: {x:0,y:0}, team: 0, hp: 10},
        {id: 1, type: "thrower", location: {x:2,y:2}, team: 1, hp: 10},
    ]);
    handleDiff(diff);
}

server.listen(6172);