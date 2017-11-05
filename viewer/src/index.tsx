/// <reference path="./declarations.d.ts" />
// note: above is wacky old declaration syntax used so that we can
// import using webpack loaders
import ReconnectingWebSocket from 'reconnectingwebsocket';
import debounce from 'lodash-es/debounce';
import * as Inferno from 'inferno';
import Component from 'inferno-component';

import * as schema from './schema';
import * as state from './state';
import {RendererComponent} from './components/renderer';
import {Stats} from './components/stats';

import * as _pure from 'purecss/build/pure.css';

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
            { id: 0, type: 'thrower', teamID: 1, location: {x: 0, y: 0}, hp: 10 },
            { id: 1, type: 'thrower', teamID: 2, location: {x: 4, y: 9}, hp: 10 },
            { id: 2, type: 'hedge', teamID: 0, location: {x: 4, y: 8}, hp: 10 },
            { id: 3, type: 'statue', teamID: 1, location: {x: 5, y: 5}, hp: 10 },
            { id: 4, type: 'thrower', teamID: 1, location: {x: 6, y: 6}, hp: 10, holding: 5 },
            { id: 5, type: 'thrower', teamID: 2, location: {x: 6, y: 6}, hp: 10, heldBy: 4 }
        ],
        sectorSize: 10,
        sectors: [
            {topLeft: {x: 0, y: 0}, controllingTeamID: 0}
        ]
    },
    teams: [
        {teamID: 0, name: 'neutral'},
        {teamID: 1, name: 'A'},
        {teamID: 2, name: 'B'}
    ]
};

let ws = new ReconnectingWebSocket('ws://localhost:6148/', [], {
    maxReconnectInterval: 5000
});

let timelines = new state.TimelineCollection();
timelines.apply(testMap);
(window as any).timelines = timelines;

let updateCbs = new Array<() => void>();

ws.onclose = (event) => {
    console.log('ws connection closed');
};
ws.onopen = (event) => {
    console.log('connected');
    const spectate: schema.SpectateAll = {
        command: "spectateAll"
    };
    ws.send(JSON.stringify(spectate));
}
ws.onerror = (err) => {
    console.log('ws error: ', err);
};
ws.onmessage = (message) => {
    // TODO validate?
    let command = JSON.parse(message.data) as schema.OutgoingCommand;
    timelines.apply(command);
    for (let cb of updateCbs) {
        cb();
    }
};

// disable right-click menus
document.addEventListener('contextmenu', event => event.preventDefault());

const renderer = () => {
    if (timelines.gameIDs.length > 0) {
        return <RendererComponent gameState={timelines.timelines[timelines.gameIDs[0]].farthest}
                                  addUpdateListener={(cb) => updateCbs.push(cb)}/>
    } else {
        return 'bananas';
    }
}

Inferno.render(renderer(), document.getElementById('app'))
