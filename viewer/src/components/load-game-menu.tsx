import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    replays: string[];
    loadReplay: (replay: string) => void;
}

interface State {
    replay?: string;
}

export class LoadGameMenu extends Component<Props, State> {

    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    onChange = (e: any) => {
        this.state.replay = e.target.value;
    }

    onClick = () => {
        if (this.state.replay) {
            this.props.loadReplay(this.state.replay);
        }
    }

    render() {
        return (
            <div className="dialog blue">
                <div>
                    Replay:
                    <select onChange={this.onChange}>
                        {this.props.replays.map((replay) => (
                            <option value={replay}>{replay}</option>
                        ))}
                    </select>
                </div>
                <button 
                    className="blue"
                    onClick={this.onClick}
                >Load my game!</button>
            </div>
        );
    }

}
