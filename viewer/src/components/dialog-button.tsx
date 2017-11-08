import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    color: string;
    label: string;
    xOffset: number;
}

interface State {
    clicked: boolean;
}

export class DialogButton extends Component<Props, State> {

    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            clicked: false,
        }
    }

    onClick = () => {
        this.setState({
            clicked: !this.state.clicked,
        });
    };

    render(props: Props, state: State) {
        return (
            <div>
                <button class={`${props.color}${this.state.clicked ? ' active' : ''}`} onclick={this.onClick}>{props.label}</button>
                {this.state.clicked ? (
                    <div class="popup" style={`left: ${props.xOffset + 50}px`}>{this.props.children}</div>
                ) : null}
            </div>
        );
    }

}
