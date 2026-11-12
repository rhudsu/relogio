import { ENTRY_FILTERS, ENTRY_SORTS, INITIAL_VISIBLE_ENTRIES } from "../config.js";
import { filterEntries, limitEntries, sortEntries } from "../models/entryModel.js";
import { markActiveOption, renderMoreButton, renderTimeline } from "../views/timelineView.js";

export function startTimeline(elements, entries, gauges) {
  const gaugeNames = new Map(gauges.map((gauge) => [gauge.id, gauge.name]));
  const filterButtons = [...elements.filterButtons];
  const sortButtons = [...elements.sortButtons];
  const state = { filter: ENTRY_FILTERS.all, sort: ENTRY_SORTS.recent, expanded: false };

  function render() {
    const ordered = sortEntries(filterEntries(entries, state.filter), state.sort);
    const { visible, hiddenCount } = limitEntries(ordered, state.expanded ? null : INITIAL_VISIBLE_ENTRIES);

    renderTimeline(elements.timeline, visible, gaugeNames);
    renderMoreButton(elements.timelineMore, hiddenCount);
    markActiveOption(filterButtons, "filter", state.filter);
    markActiveOption(sortButtons, "sort", state.sort);
  }

  function update(change) {
    Object.assign(state, change, { expanded: false });
    render();
  }

  filterButtons.forEach((button) => button.addEventListener("click", () => update({ filter: button.dataset.filter })));
  sortButtons.forEach((button) => button.addEventListener("click", () => update({ sort: button.dataset.sort })));
  elements.timelineMore.addEventListener("click", () => {
    state.expanded = true;
    render();
  });

  render();
}
