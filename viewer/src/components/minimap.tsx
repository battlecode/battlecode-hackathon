import * as Inferno from 'inferno';
import Component from 'inferno-component';

import * as schema from '../schema';
import * as state from '../state';
import {setColor, updateTileBuffer, TEAM_COLORS} from './renderer';

export class Minimap extends Component<{gameState: state.State}, {}> {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    image: ImageData;

    constructor(props: {gameState: state.State}) {
        super(props);
    }

    render() {
        let {width, height} = this.props.gameState;
        return <canvas height={height}
                       width={width}
                       className='pixelated'
                       style={`width: ${width}px; height: ${height}px; display: block;`}
                       ref={(e) => this.canvas = e}></canvas>
    }

    componentDidMount() {
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        this.image = this.ctx.getImageData(0, 0, this.props.gameState.width, this.props.gameState.height);
        this.draw();
    }

    componentDidUpdate() {
        this.draw();
    }

    draw() {
        updateTileBuffer(this.image.data, this.props.gameState);
        let {width, height} = this.props.gameState;
        for (let ent of this.props.gameState.entities) {
            if (ent === undefined) continue;
            setColor(this.image.data, width, height, ent.location.x, ent.location.y, TEAM_COLORS[ent.teamID]);
        }
        this.ctx.putImageData(this.image, 0, 0);
    }
}
