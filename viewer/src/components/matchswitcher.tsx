import * as Inferno from 'inferno';
import Component from 'inferno-component';

import * as schema from '../schema';
import * as state from '../state';
import {setColor, updateTileBuffer, TEAM_COLORS} from './renderer';

export default class MatchSwitcher {
    states: {[gameID: string]: state.State};
    canvases: {[gameID: string]: HTMLCanvasElement};

    width: number;
    height: number;
    domNode: HTMLElement;

    update = (state: state.State, next: schema.NextTurn) => {
    }

    on(event: 'switch' | 'close', cb: (id: schema.GameID) => void) {
    }
}

class Minimap extends Component<{state: state.State}, {}> {
    public state = {};

    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    image: ImageData;

    constructor(props: {state: state.State}) {
        super(props);
    }

    render() {
        return <canvas height={this.props.state.height} width={this.props.state.width}></canvas>
    }

    onComponentDidMount(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        this.image = this.ctx.getImageData(0, 0, this.props.state.width, this.props.state.height);
        this.draw();
    }

    onComponentDidUpdate() {
        this.draw();
    }

    draw() {
        updateTileBuffer(this.image.data, this.props.state);
        let {width, height} = this.props.state;
        for (let ent of this.props.state.entities) {
            if (ent === undefined) continue;
            setColor(this.image.data, width, height, ent.location.x, ent.location.y, TEAM_COLORS[ent.teamID]);
        }
        this.ctx.putImageData(this.image, 0, 0);
    }
}
