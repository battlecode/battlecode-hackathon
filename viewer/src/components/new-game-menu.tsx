import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    maps: string[];
    createGame: (map: string) => void;
    replays: string[];
    loadReplay: (replay: string) => void;
}

interface State {
    map?: string;
    replay?: string;
}

export class NewGameMenu extends Component<Props, State> {

    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    onNewChange = (e: any) => {
        this.state.map = e.target.value;
    }

    onNewClick = () => {
        if (this.state.map) {
            this.props.createGame(this.state.map);
        }
    }

    onLoadChange = (e: any) => {
        this.state.replay = e.target.value;
    }

    onLoadClick = () => {
        if (this.state.replay) {
            this.props.loadReplay(this.state.replay);
        }
    }

    render() {
        return (
            <div className="dialog green">
                <div>Here, you can start a new game! You need only to specify a map.</div>
                <div>
                    Map:
                    <select onChange={this.onNewChange}>
                        {this.props.maps.map((map) => (
                            <option value={map}>{map}</option>
                        ))}
                    </select>
                </div>
                <div>Alternatively, you can load an existing replay.</div>
                <div>
                    Replay:
                    <select onChange={this.onLoadChange}>
                        {this.props.replays.map((replay) => (
                            <option value={replay}>{replay}</option>
                        ))}
                    </select>
                </div>
                <button 
                    className="green thin"
                    onClick={this.onNewClick}
                >Create my game!</button>
                <button 
                    className="green thin"
                    onClick={this.onLoadClick}
                >Load my replay!</button>
            </div>
        );
    }

}
