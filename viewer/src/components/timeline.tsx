import * as Inferno from 'inferno';
import Component from 'inferno-component';

import {
    TIMELINE_WIDTH,
    TOP_BAR_HEIGHT,
} from '../constants';

interface TimelineProps {
    currentRound: number;
    farthestRound: number;
    maxRound: number;
    changeRound: (number) => void;
}

export class Timeline extends Component<TimelineProps, {}> {

    absToRound = (x: number) => {
        const offset = 502;
        return (x - offset) * (this.props.maxRound / TIMELINE_WIDTH);
    }

    onClick = (e) => {
        const round = this.absToRound(e.pageX);
        this.props.changeRound(round);
    }

    render(props: TimelineProps) {
        return (
            <div class="timeline">
                <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"
                    width={TIMELINE_WIDTH} height={TOP_BAR_HEIGHT}
                    viewBox={`0 0 ${props.maxRound + 10} ${TOP_BAR_HEIGHT * props.maxRound / TIMELINE_WIDTH}`}
                    onClick={this.onClick} >
                    <defs>
                        <mask id="timelineMask" maskUnits="userSpaceOnUse"
                            x="0" y="0" width={props.maxRound} height="100">
                            <rect x="2.5" y="10" width={props.maxRound} height="70" rx="20" fill="white" />
                        </mask>
                        <mask id="timelineMaskInvert" maskUnits="userSpaceOnUse"
                            x="0" y="0" width={props.maxRound + 10} height="100">
                            <rect x="0" y="0" width="10000" height="10000" fill="white" />
                            <rect x="2.5" y="10" width={props.maxRound} height="70" rx="20" fill="black" />
                        </mask>
                    </defs>
                    <rect id="timeline-bounds" width={props.maxRound + 5} height="75" y="7.5" x="0" rx="25" fill="#000000" mask="url(#timelineMaskInvert" />
                    <rect id="timeline" width={props.farthestRound} height="1000" y="0" x="2.5" mask="url(#timelineMask)" />
                    <rect id="cursor" width="10" height="75" x={props.currentRound - 5} y="7.5" />
                </svg>
            </div >
        );
    }
}
