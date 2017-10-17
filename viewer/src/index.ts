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
        command: 'start',
        map: {
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
            sector_size: 2
        },
        teams: [
            {id: 0, name: 'neutral'},
            {id: 1, name: 'A'},
            {id: 2, name: 'B'}
        ]
    });
    renderer.update({
        command: "next_turn",
        changed: [
            { id: 0, type: 'thrower', team: 1, location: {x: 0, y: 0}, hp: 10 },
            { id: 1, type: 'thrower', team: 2, location: {x: 4, y: 9}, hp: 10 },
            { id: 2, type: 'hedge', team: 0, location: {x: 4, y: 8}, hp: 10 },
            { id: 3, type: 'statue', team: 1, location: {x: 5, y: 5}, hp: 10 },
        ],
        dead: [],
        changed_sectors: [],

        successful: [],
        failed: [],
        reasons: [],

        next_team: 1
    });
    document.body.appendChild(renderer.domElement);
};
setupTest();

let ws = new ReconnectingWebSocket('ws://localhost:6173/', []);

ws.onclose = (event) => {
    console.log('ws connection closed');
};
ws.onopen = (event) => {
    console.log('connected');
}
ws.onerror = (err) => {
    console.log('ws error: ', err);
};
ws.onmessage = (message) => {
    let command = JSON.parse(message.data);
    // TODO validate?
    if (command.command === 'start') {
        if (renderer) {
            renderer.dispose();
        }

        renderer = new Renderer(command);
        document.body.appendChild(renderer.domElement);
    } else if (command.command === 'next_turn') {
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