import * as Inferno from 'inferno';
import Component from 'inferno-component';

import {TOP_BAR_HEIGHT} from '../constants';

interface Props extends Inferno.Props {
    active: boolean;
    idx: number;
    color: string;
    label: string;
    xOffset: number;
    deselectAllExceptToggle: (i: number) => void;
}

export class DialogButton extends Component<Props, {}> {

    onClick = () => {
        this.props.deselectAllExceptToggle(this.props.idx);
    };

    render() {
        return (
            <div>
                <button class={`${this.props.color}${this.props.active ? ' active' : ''}`} onclick={this.onClick}>{this.props.label}</button>
                {this.props.active ? (
                    <div class="popup" style={`left: ${this.props.xOffset}px; top: ${TOP_BAR_HEIGHT}px;`}>{this.props.children}</div>
                ) : null}
            </div>
        );
    }

}
