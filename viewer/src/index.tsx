/// <reference path="./declarations.d.ts" />
// note: above is wacky old declaration syntax used so that we can
// import using webpack loaders
import ReconnectingWebSocket from 'reconnectingwebsocket';
import { frameDebounce } from './util/framedebounce';
import * as Inferno from 'inferno';
import Component from 'inferno-component';
import "babel-polyfill";

import * as schema from './schema';
import * as state from './state';
import { TOP_BAR_HEIGHT } from './constants';
import { RendererComponent } from './components/renderer';
import { Stats } from './components/stats';
import { Minimap } from './components/minimap';
import { TopBar } from './components/topbar';
import { ActiveGamesList } from './components/active-games-list';
import { ActiveGameInfo } from './types';

require('purecss/build/pure.css');
require('./style.css');

const testMap: schema.GameStart = {
    gameID: 'test',
    command: 'start',
    initialState: {
        mapName: 'test',
        version: 'battlecode 2017 hackathon map',
        teamCount: 2,
        width: 10,
        height: 10,
        tiles: [
            ['G', 'G', 'G', 'D', 'D', 'D', 'D', 'G', 'G', 'G'],
            ['D', 'G', 'D', 'D', 'D', 'D', 'D', 'G', 'D', 'D'],
            ['D', 'G', 'D', 'D', 'D', 'D', 'D', 'G', 'G', 'D'],
            ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'G', 'D', 'D'],
            ['D', 'G', 'G', 'D', 'D', 'D', 'D', 'G', 'G', 'G'],
            ['G', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'],
            ['D', 'G', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'],
            ['D', 'D', 'G', 'D', 'D', 'D', 'D', 'G', 'G', 'G'],
            ['D', 'D', 'G', 'D', 'D', 'D', 'D', 'D', 'G', 'D'],
            ['G', 'G', 'D', 'D', 'D', 'D', 'D', 'D', 'G', 'D'],
        ],
        entities: [
            { id: 0, type: 'thrower', teamID: 1, location: { x: 0, y: 0 }, hp: 10 },
            { id: 1, type: 'thrower', teamID: 2, location: { x: 4, y: 9 }, hp: 10 },
            { id: 2, type: 'hedge', teamID: 0, location: { x: 4, y: 8 }, hp: 10 },
            { id: 3, type: 'statue', teamID: 1, location: { x: 5, y: 5 }, hp: 10 },
            { id: 4, type: 'thrower', teamID: 1, location: { x: 6, y: 6 }, hp: 10, holding: 5 },
            { id: 5, type: 'thrower', teamID: 2, location: { x: 6, y: 6 }, hp: 10, heldBy: 4 }
        ],
        sectorSize: 10,
        sectors: [
            { topLeft: { x: 0, y: 0 }, controllingTeamID: 0 }
        ]
    },
    teams: [
        { teamID: 0, name: 'neutral' },
        { teamID: 1, name: 'A' },
        { teamID: 2, name: 'B' }
    ],
    timeoutMS: 100,
};

let ws = new ReconnectingWebSocket('ws://localhost:6148/', [], {
    maxReconnectInterval: 5000
});

let timelines = new state.TimelineCollection();
timelines.apply(testMap);
window['timelines'] = timelines;

let updateCbs = new Array<() => void>();

let maps: string[] = [];
let replays: string[] = [];

let lastUpdateTime: number = performance.now();
let turnsPerSecond: number = 10;
let isPlaying: boolean = false;

let activeGames: {[gameID: string]: ActiveGameInfo} = {};

ws.onclose = (event) => {
    console.log('ws connection closed');
};
ws.onopen = (event) => {
    console.log('connected');
    const spectate: schema.SpectateAll = {
        command: "spectateAll"
    };
    ws.send(JSON.stringify(spectate));
    const getMaps: schema.ListMapsRequest = {
        command: "listMapsRequest"
    };
    ws.send(JSON.stringify(getMaps));
    const getReplays: schema.ListReplaysRequest = {
        command: "listReplaysRequest"
    };
    ws.send(JSON.stringify(getReplays));
}
ws.onerror = (err) => {
    console.log('ws error: ', err);
};
ws.onmessage = (message) => {
    // TODO validate?
    console.log(message);
    let command = JSON.parse(message.data) as schema.OutgoingCommand;
    if (command.command === "listMapsResponse") {
        maps = command.mapNames;
    }
    if (command.command === "listReplaysResponse") {
        replays = command.replayNames;
    }
    if (command.command === "createGameConfirm") {
        if (!(command.gameID in activeGames)) {
            activeGames[command.gameID] = {
                status: 'waiting',
                mapName: '1-136',
                closeActiveGame: getCloseActiveGame(command.gameID),
            };
        }
    }
    timelines.apply(command);
    for (let cb of updateCbs) {
        cb();
    }
    render();
};

const createGame = (map: string) => {
    const create: schema.CreateGame = {
        command: "createGame",
        map: map,
        sendReplay: true,
        timeoutMS: 100,
    };
    console.log("creating game");
    ws.send(JSON.stringify(create));
}

const loadReplay = (replay: string) => {
    const load: schema.ReplayRequest = {
        command: "replayRequest",
        name: replay,
    };
    ws.send(JSON.stringify(load));
}

const timelineChangeRound = (round: number) => {
    if (timelines.gameIDs.length > 0) {
        let gameID = timelines.gameIDs[timelines.gameIDs.length - 1];
        timelines.timelines[gameID].load(round, render);
    }
}

const togglePlaying = () => {
    isPlaying = !isPlaying;
    render();
}

const updateCurrentFrame = (time: number) => {
    const updateInterval = 1000 / turnsPerSecond;
    const thisInterval = time - lastUpdateTime;
    const numTurns = (thisInterval / updateInterval);
    
    const end = () => {
        lastUpdateTime = time - (thisInterval % updateInterval);
        render();
        window.requestAnimationFrame(updateCurrentFrame);
    }

    if (isPlaying && timelines.gameIDs.length > 0) {
        const gameID = timelines.gameIDs[timelines.gameIDs.length - 1];
        const timeline = timelines.timelines[gameID];
        const turnToLoad = Math.min(timeline.current.turn + Math.floor(numTurns), timeline.farthest.turn);
        const numTurnsToLoad = turnToLoad - timeline.current.turn;
        if (turnToLoad >= 0) {
            timelines.timelines[gameID].loadNextNTurns(numTurnsToLoad, end);
        } else {
            end();
        }
    } else {
        end();
    }
}

const togglePlaybackRate = () => {
    const playbackRates = [1, 5, 10, 50, 1];
    turnsPerSecond = playbackRates[playbackRates.indexOf(turnsPerSecond) + 1];
    render();
}

const getCloseActiveGame = (gameID: schema.GameID) => (() => {
    delete activeGames[gameID];
});

activeGames['fred'] = {
    status: 'running',
    mapName: 'temple of anubis',
    closeActiveGame: getCloseActiveGame('fred'),
};

// disable right-click menus
document.addEventListener('contextmenu', event => event.preventDefault());

const renderer = () => {
    if (timelines.gameIDs.length > 0) {
        let gameID = timelines.gameIDs[timelines.gameIDs.length - 1]
        return (
            <div>
                <TopBar
                    maps={maps}
                    createGame={createGame}
                    replays={replays}
                    loadReplay={loadReplay}
                    currentRound={timelines.timelines[gameID].current.turn}
                    farthestRound={timelines.timelines[gameID].farthest.turn}
                    maxRound={1000}
                    changeRound={timelineChangeRound}
                    turnsPerSecond={turnsPerSecond}
                    isPlaying={isPlaying}
                    togglePlaying={togglePlaying}
                    togglePlaybackRate={togglePlaybackRate}
                />
                <ActiveGamesList
                    games={Object.keys(activeGames).map((key) => activeGames[key])}
                />
                <div style={`position: relative;`}>
                    <RendererComponent gameState={timelines.timelines[gameID].current}
                        key={gameID}
                        addUpdateListener={(cb) => updateCbs.push(cb)} />
                    <div style="position: absolute; top: 100px; left: 0; z-index: 20000;">
                        minimap test
                        {timelines.gameIDs.map(id => <Minimap gameState={timelines.timelines[id].current} />)}
                    </div>
                </div>
            </div>
        );
    } else {
        return 'bananas';
    }
}

const render = frameDebounce(() => {
    Inferno.render(renderer(), document.getElementById('app'))
});
render();

window.addEventListener('resize', render, false);

window.requestAnimationFrame(updateCurrentFrame);
