/// <reference path="./declarations.d.ts" />
// note: above is wacky old declaration syntax used so that we can
// import using webpack loaders

import * as schema from './schema';

import Renderer from './renderer';

import ReconnectingWebSocket from 'reconnectingwebsocket';

import Stats from 'stats.js';

let renderer: Renderer | undefined = undefined;

// add test world when we're not connected to the server
const setupTest = () => {
    if (renderer) {
        renderer.dispose();
    }
    renderer = new Renderer({
        gameID: 'test',
        command: 'start',
        initialState: {
            name: 'test',
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
    });
    renderer.update({
        gameID: 'test',
        command: "nextTurn",
        turn: 0,
        changed: [],
        dead: [],
        changedSectors: [],
        successful: [],
        failed: [],
        reasons: [],

        lastTeamID: 0,
        nextTeamID: 1
    });
    document.body.appendChild(renderer.domElement);
};
setupTest();

let ws = new ReconnectingWebSocket('ws://localhost:6148/', [], {
    maxReconnectInterval: 5000
});

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
    let command = <schema.OutgoingCommand>JSON.parse(message.data);
    newUpdate();
    // TODO validate?
    if (command.command === 'start') {
        if (renderer) {
            renderer.dispose();
        }

        renderer = new Renderer(command);
        document.body.appendChild(renderer.domElement);
    } else if (command.command === 'nextTurn') {
        if (renderer) {
            renderer.update(command);
        } else {
            console.log("no renderer, skipping turn");
        }
    }
};

document.onmousemove = (e) => {
    if (renderer) {
        renderer.setMouse(e.pageX, e.pageY);
    }
};

// 0: fps, 1: ms, 2: mb, 3+: custom
// note: stats library has no types, double check your
// method calls
var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const updateTimePanel = new Stats.Panel("UPDT MS", "#d6d8ff", "#424ef4");
updateTimePanel.update(0, 100);
stats.addPanel(updateTimePanel);
let lastUpdate = Date.now();
let runningUpdate = 0;
const newUpdate = () => {
    let now = Date.now();
    let delta = now - lastUpdate;
    runningUpdate = runningUpdate * .5 + delta * .5;
    updateTimePanel.update(runningUpdate, 100);
    lastUpdate = now;
}

// rendering loop
const render = () => {
    stats.begin();
    if (renderer) {
        renderer.render();
    }
    stats.end();
    requestAnimationFrame(render);
}
render();