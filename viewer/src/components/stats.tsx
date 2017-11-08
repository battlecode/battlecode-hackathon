import * as Inferno from 'inferno';
import Component from 'inferno-component';
import WrappedStats from 'stats.js';

export interface StatsProps {
    addUpdateListener: (cb: () => void) => void;
    onRenderBegin: (cb: () => void) => void;
    onRenderEnd: (cb: () => void) => void;
}
export interface StatsState {
    wrapped: any;
}

export class Stats extends Component<StatsProps, StatsState> {
    domNode: HTMLDivElement;

    constructor(props: StatsProps) {
        super(props);
        this.state = {
            wrapped: new WrappedStats()
        }
        const updateTimePanel = new WrappedStats.Panel("UPDT MS", "#d6d8ff", "#424ef4");
        updateTimePanel.update(0, 100);
        this.state.wrapped.addPanel(updateTimePanel);
        this.state.wrapped.showPanel(0);
        let lastUpdate = Date.now();
        let runningUpdate = 0;
        const newUpdate = () => {
            let now = Date.now();
            let delta = now - lastUpdate;
            runningUpdate = runningUpdate * .5 + delta * .5;
            updateTimePanel.update(runningUpdate, 100);
            lastUpdate = now;
        }
        this.props.addUpdateListener(newUpdate);
        this.props.onRenderBegin(() => {
            if (this.state === null) return;
            this.state.wrapped.begin()
        });
        this.props.onRenderEnd(() => {
            if (this.state === null) return;
            this.state.wrapped.end()
        });
    }

    render() {
        return <div ref={(input) => this.domNode = input} ></div>
    }

    componentDidMount() {
        if (this.state === null) return;
        this.domNode.appendChild(this.state.wrapped.dom);
    }
}