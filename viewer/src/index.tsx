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
import { GameStatus, ActiveGameInfo } from './types';

require('purecss/build/pure.css');
require('./style.css');




let timelines = new state.TimelineCollection();
window['timelines'] = timelines;

let updateCbs = new Array<() => void>();

let maps: string[] = [];
let replays: string[] = [];

let lastUpdateTime: number = performance.now();
let turnsPerSecond: number = 10;
let isPlaying: boolean = false;

let activeGames: {[gameID: string]: ActiveGameInfo} = {};

let currentGameID: string | undefined;

let ws: ReconnectingWebSocket;
if (window['BATTLECODE_RUN_MATCH'] !== undefined) {
    fetch(window['BATTLECODE_RUN_MATCH']).then(async result => {
        timelines.loadReplay(new Uint8Array(await result.arrayBuffer()));
        currentGameID = timelines.gameIDs[0];
        isPlaying = true;
    })
    .catch(err => {
        console.log(err);
    });
} else {
    ws = new ReconnectingWebSocket('ws://localhost:6148/', [], {
        maxReconnectInterval: 5000
    });
    ws.onclose = (event) => {
        console.log('ws connection closed');
    };
    ws.onopen = (event) => {
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
        let command = JSON.parse(message.data) as schema.OutgoingCommand;
        if (command.command === "listMapsResponse") {
            maps = command.mapNames;
        }
        if (command.command === "listReplaysResponse") {
            replays = command.replayNames;
        }
        if (command.command === "gameStatusUpdate") {
            if (command.gameID in activeGames) {
                if ((command.status == 'finished' || command.status == 'cancelled') || (command.status == 'running' && activeGames[command.gameID].status == 'lobby')) {
                    activeGames[command.gameID].status = command.status;
                }
            } else {
                activeGames[command.gameID] = {
                    gameID: command.gameID,
                    status: command.status as GameStatus,
                    mapName: command.map,
                    closeActiveGame: getCloseActiveGame(command.gameID),
                    viewActiveGame: getViewActiveGame(command.gameID),
                }
            }
            if (command.connected.length > 0) {
                activeGames[command.gameID].playerOne = command.connected[0];
            }
            if (command.connected.length > 1) {
                activeGames[command.gameID].playerTwo = command.connected[1];
            }
        }
        if (command.command === "start") {
            currentGameID = command.gameID;
            isPlaying = true;
        }
        if (command.command != "gameReplay") {
            timelines.apply(command, addNewGame);
        }
        for (let cb of updateCbs) {
            cb();
        }
        render();
    };
}

const createGame = (map: string) => {
    const create: schema.CreateGame = {
        command: "createGame",
        map: map,
        sendReplay: true,
        timeoutMS: 2000,
    };
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
    if (currentGameID) {
        timelines.timelines[currentGameID].load(round, render);
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

    if (isPlaying && currentGameID) {
        const timeline = timelines.timelines[currentGameID];
        const turnToLoad = Math.min(timeline.current.turn + Math.floor(numTurns), timeline.farthest.turn);
        const numTurnsToLoad = turnToLoad - timeline.current.turn;
        if (numTurnsToLoad > 0) {
            timelines.timelines[currentGameID].loadNextNTurns(numTurnsToLoad, end);
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

export const getCloseActiveGame = (gameID: schema.GameID) => (() => {
    delete activeGames[gameID];
    if (gameID == currentGameID) {
        if (Object.keys(activeGames).length > 0) {
            currentGameID = Object.keys(activeGames)[0];
        } else {
            currentGameID = undefined;
        }
    }
});

export const getViewActiveGame = (gameID: schema.GameID) => (() => {
    currentGameID = gameID;
});

const addNewGame = (gameInfo: ActiveGameInfo) => {
    const gameID = gameInfo.gameID;
    if (!(gameID in activeGames)) {
        activeGames[gameID] = gameInfo;
    }
    currentGameID = gameID;
    isPlaying = true;
}

// disable right-click menus
document.addEventListener('contextmenu', event => event.preventDefault());

const renderer = () => {
    return (
        <div>
            <TopBar
                maps={maps}
                createGame={createGame}
                replays={replays}
                loadReplay={loadReplay}
                currentRound={currentGameID ? timelines.timelines[currentGameID].current.turn : 0}
                farthestRound={currentGameID ? timelines.timelines[currentGameID].farthest.turn : 0}
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
            {currentGameID ? (
                 <div style={`position: relative;`}>
                     <RendererComponent gameState={timelines.timelines[currentGameID].current}
                                        key={currentGameID}
                                        addUpdateListener={(cb) => updateCbs.push(cb)} />
                 </div>
            ) : (
                 <p>
                     Welcome to the Battlehack Client! To begin, start a new game, or load an existing replay, using the above interface.
                 </p>
            )}
        </div>
    );
}

const render = frameDebounce(() => {
    Inferno.render(renderer(), document.getElementById('app'))
});
render();

window.addEventListener('resize', render, false);

window.requestAnimationFrame(updateCurrentFrame);
