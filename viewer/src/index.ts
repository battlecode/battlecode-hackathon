/// <reference path="./webpack.d.ts" />
// note: above is wacky old declaration syntax used so that we can
// import using webpack loaders

import * as WebSocket from 'ws';
import * as schema from './schema';

import Renderer from './renderer';

let renderer: Renderer | undefined = undefined;

const reset = () => {
    if (renderer) {
        renderer.dispose();
        renderer = undefined;
    }
}

const ws = new WebSocket(
    "localhost:6173"
);
ws.on('close', (code, reason) => {
    console.log('ws connection closed: '+code+' '+reason);
    reset();
});
ws.on('error', (err) => {
    console.log('ws error: '+err.message);
});
ws.on('message', (message: schema.OutgoingCommand) => {
    // TODO validate?
    if (message.command === 'start') {
        reset();
        renderer = new Renderer(message);
        document.body.appendChild(renderer.domElement);
    } else if (message.command === 'next_turn') {
        if (renderer) {
            renderer.update(message);
        } else {
            console.log("no renderer, skipping turn");
        }
    }
});

// rendering loop
const render = () => {
    if (renderer) {
        renderer.render();
    }
    requestAnimationFrame(render);
}
render();
