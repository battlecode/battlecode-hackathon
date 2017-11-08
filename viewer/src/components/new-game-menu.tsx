import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    maps: string[];
    createGame: (map: string) => void;
}

interface State {
    map?: string;
}

export class NewGameMenu extends Component<Props, State> {

    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    onChange = (e: any) => {
        this.state.map = e.target.value;
    }

    onClick = () => {
        if (this.state.map) {
            this.props.createGame(this.state.map);
        }
    }

    render() {
        return (
            <div className="dialog green">
                <div>
                    Map:
                    <select onChange={this.onChange}>
                        {this.props.maps.map((map) => (
                            <option value={map}>{map}</option>
                        ))}
                    </select>
                </div>
                <button 
                    className="green"
                    onClick={this.onClick}
                >Create my game!</button>
            </div>
        );
    }

}
