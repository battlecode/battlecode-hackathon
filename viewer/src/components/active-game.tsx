import * as Inferno from 'inferno';
import Component from 'inferno-component';

import { ActiveGameInfo, GameStatus } from '../types';

interface Props extends Inferno.Props {
    game: ActiveGameInfo;
}

interface State {
    aboutToClose: boolean;
}

export class ActiveGame extends Component<Props, State> {

    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            aboutToClose: false,
        };
    }

    formatStatus = () => {
        const status = this.props.game.status;
        if (status === 'lobby') {
            return 'Waiting for players...';
        } else if (status === 'running') {
            return 'Running...';
        } else if (status === 'finished') {
            return 'Finished!';
        } else if (status === 'cancelled') {
            return 'Cancelled :(';
        }
    };
    
    onCloseClick = () => {
        this.state.aboutToClose = true;
    }

    onCloseCancelClick = () => {
        this.state.aboutToClose = false;
    }

    onCloseConfirmClick = () => {
        this.props.game.closeActiveGame();
    }

    render() {
        return (
            <div class="dialog">
                <div>
                    {this.state.aboutToClose ? (
                         <span class="red">Are you sure?</span>
                    ) : (
                         <span>Status: {this.formatStatus()}</span>
                    )}
                </div>
                <div>
                    Map: {this.props.game.mapName}
                </div>
                <div>
                    <span class="red">{this.props.game.playerOne || 'pending'} </span>
                    vs.
                    <span class="blue"> {this.props.game.playerTwo || 'pending'}</span>
                </div>
                {this.state.aboutToClose ? (
                     <span>
                         <button class="red thin" onclick={this.onCloseConfirmClick} key={`closeConfirm${this.props.game.gameID}`}>Yes</button>
                         <button class="green thin" onclick={this.onCloseCancelClick} key={`closeCancel${this.props.game.gameID}`}>No</button>
                     </span>
                ) : (
                     <span>
                         <button class="blue thin" key={`view${this.props.game.gameID}`}>View</button>
                         <button class="red thin" onclick={this.onCloseClick} key={`close${this.props.game.gameID}`}>Close</button>
                     </span>
                )}
            </div>
        );
    }

}
