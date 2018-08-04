import * as React from "react";
import throttle from "lodash.throttle";
import { requestAnimationFrame } from "./lib/rAF";
import { createScheduler } from "./lib/schedule";
import { Movie } from "./movie";
import { Projector } from "./projector";

export class MovieList extends React.PureComponent<
  {
    // 帧渲染函数 TODO: 返回值类型应该为html元素，找一找typescript里如何表示
    itemRenderer: (item: any, index: number) => any;

    // Buffer height / Screen height，控制缓冲区的大小
    bufferHeightRatio: number;

    // 电影对象，可以缓存
    movie: Movie;
  },
  {
    // 渲染帧的起始索引
    renderSliceStart: number;
    // 渲染帧的结束索引
    renderSliceEnd: number;
  }
> {
  state = {
    renderSliceStart: 0,
    renderSliceEnd: 0
  };

  private _listRef = React.createRef<HTMLDivElement>();
  private _renderedFrameHeights: Record<number, number> = {};
  private _projector = new Projector(window);
  private _isUnmounted;
  private _unlistenScroll;
  private _unlistenResize;
  private _prevMovie: Movie;

  /**
   * 1. 注册scroll和resize事件的监听函数
   * 2. 调度第一次投影操作
   */
  componentDidMount() {
    const throttleDuration = 200;

    this._unlistenScroll = this._projector.addScrollListener(
      throttle(this._scheduleProjection, throttleDuration, {
        trailing: true,
        leading: false
      })
    );

    // TODO: 增加对resize事件的监听处理
  }

  componentDidUpdate() {
    this._correctProjection();
  }

  componentWillUnmount() {
    this._isUnmounted = true;

    // 取消事件侦听
    if (this._unlistenScroll) {
      this._unlistenScroll();
    }
    if (this._unlistenResize) {
      this._unlistenResize();
    }
  }

  render() {
    // 清除临时缓存
    this._renderedFrameHeights = {};

    let { fakeSpaceAbove, fakeSpaceBelow } = this._getRenderFakeSpace();

    return (
      <div
        ref={this._listRef}
        style={{
          paddingTop: fakeSpaceAbove,
          paddingBottom: fakeSpaceBelow
        }}
      >
        {this.props.movie.frameList
          .slice(this.state.renderSliceStart, this.state.renderSliceEnd)
          .map((item, index) => {
            // 被渲染帧的实际索引
            const actualIndex = index + this.state.renderSliceStart;

            // 调用用户定义的帧渲染函数。
            const reactElement = this.props.itemRenderer(
              item.content,
              actualIndex
            );

            return React.cloneElement(reactElement, {
              key: actualIndex,
              ref: (ref: HTMLDivElement) => {
                if (ref) {
                  // TODO: 搞清楚使用getBoundingClientRect()到底会不会影响性能。
                  //let height = ref.getBoundingClientRect().height;
                  let height = ref.offsetHeight;

                  this._renderedFrameHeights[actualIndex] = height;

                  // 如果有用户自定义的ref函数，调用它。
                  if ("function" === typeof reactElement.ref) {
                    reactElement.ref(ref);
                  }
                }
              }
            });
          })}
      </div>
    );
  }

  // 创建投影计算调度器
  private _scheduleProjection = createScheduler(() => {
    const { movie, bufferHeightRatio } = this.props;

    if (this._isUnmounted || 0 === movie.frameList.length) {
      return;
    }

    this._projector.updateRectRelativeTo(this._listRef.current);

    const result = this._projector.project({
      movie: this.props.movie,
      bufferRatio: bufferHeightRatio
    });

    this.setState({
      renderSliceStart: result.sliceStart,
      renderSliceEnd: result.sliceEnd
    });
  }, requestAnimationFrame);

  /**
   * 矫正当前的投影
   */
  private _correctProjection = () => {
    if (!this._listRef.current) {
      return;
    }

    let isMovieFrameListChange = false;
    if (this._prevMovie !== this.props.movie) {
      isMovieFrameListChange = true;
    }
    this._prevMovie = this.props.movie;

    let heightError = this.props.movie.updateFrameHeights(
      this._renderedFrameHeights
    );

    if (heightError !== 0 || isMovieFrameListChange) this._scheduleProjection();
  };

  private _getRenderFakeSpace = () => {
    const frameList = this.props.movie.frameList;
    const startIndex = this.state.renderSliceStart;
    const endIndex = this.state.renderSliceEnd;

    return {
      fakeSpaceAbove:
        frameList.length <= 0
          ? 0
          : frameList[startIndex].rect.getTop() - frameList[0].rect.getTop(),
      fakeSpaceBelow:
        endIndex >= frameList.length
          ? 0
          : frameList[frameList.length - 1].rect.getBottom() -
            frameList[endIndex].rect.getTop()
    };
  };
}