import * as Inferno from 'inferno';
import Component from 'inferno-component';

import { ActiveGameInfo, GameStatus } from '../types';

interface Props extends Inferno.Props {
    game: ActiveGameInfo;
}

export class ActiveGame extends Component<Props, {}> {

    formatStatus = (status: GameStatus) => {
        if (status == 'waiting') {
            return 'Waiting for players...';
        } else if (status == 'running') {
            return 'Running...';
        } else if (status == 'finished') {
            return 'Finished!';
        }
    };

    render() {
        return (
            <div class="dialog">
                <div>
                    {this.formatStatus(this.props.game.status)}
                </div>
                <div>
                    Map: {this.props.game.mapName}
                </div>
                <div>
                    <span class="red">{this.props.game.playerOne} </span>
                    vs.
                    <span class="blue"> {this.props.game.playerTwo}</span>
                </div>
                <button class="blue thin">View</button>
                <button class="red thin">Close</button>
            </div>
        );
    }

}
