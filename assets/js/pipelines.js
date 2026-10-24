/*
 * BDMA — the aggregation pipeline behind every dashboard panel.
 *
 * Generated and verified against data/uber_bookings.json: each pipeline below was
 * executed over all 15,000 documents and its output compared field-by-field with
 * data/uber_summary.json, which is what the dashboard renders. They match exactly.
 *
 * Note there is no $round anywhere. Rounding in the pipeline is an anti-pattern for
 * charting: it destroys precision for any downstream aggregation, and MongoDB $round
 * breaks ties to even (40.445 -> 40.44) while most display layers round half up
 * (40.445 -> 40.45), so rounding early makes the pipeline and the chart disagree in
 * the last digit. Format in the chart, not in the pipeline.
 */
window.BDMA_PIPELINES = {
  kpis: {
    title: "Headline KPIs",
    panel: "The headline numbers",
    chart: "Number / KPI chart (one per metric)",
    encodings: [["Value","completion_rate_pct — Aggregate: unaggregated"]],
    note: "Atlas Charts has no multi-KPI card. Build one Number chart per metric, all from this one pipeline, then arrange them on the dashboard row.",
    pipeline: "[\n  { $group: {\n      _id: null,\n      total_bookings:          { $sum: 1 },\n      completed_bookings:      { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, 1, 0] } },\n      completed_booking_value: { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, \"$booking_value\", 0] } },\n      total_booking_value:     { $sum: { $ifNull: [\"$booking_value\", 0] } },\n      completed_distance_km:   { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, \"$ride_distance\", 0] } },\n      avg_driver_rating:       { $avg: \"$ratings.driver\" },\n      avg_customer_rating:     { $avg: \"$ratings.customer\" },\n      avg_vtat_min:            { $avg: \"$avg_vtat\" }\n  } },\n  { $set: { failed_bookings: { $subtract: [\"$total_bookings\", \"$completed_bookings\"] } } },\n  { $project: {\n      _id: 0,\n      total_bookings: 1, completed_bookings: 1, failed_bookings: 1,\n      total_booking_value: 1, completed_booking_value: 1,\n      avg_driver_rating: 1, avg_customer_rating: 1, avg_vtat_min: 1,\n      total_distance_km:   \"$completed_distance_km\",\n      completion_rate_pct: { $multiply: [{ $divide: [\"$completed_bookings\", \"$total_bookings\"] }, 100] },\n      failure_rate_pct:    { $multiply: [{ $divide: [\"$failed_bookings\",    \"$total_bookings\"] }, 100] },\n      avg_booking_value:   { $divide: [\"$completed_booking_value\", \"$completed_bookings\"] },\n      avg_distance_km:     { $divide: [\"$completed_distance_km\",   \"$completed_bookings\"] },\n      lost_revenue_estimate: { $multiply: [\n        { $divide: [\"$completed_booking_value\", \"$completed_bookings\"] }, \"$failed_bookings\"] }\n  } }\n]"
  },
  status_breakdown: {
    title: "Booking status mix",
    panel: "Booking status mix",
    chart: "Donut",
    encodings: [["Label","status"],["Arc","bookings — Aggregate: sum"]],
    note: "Sort the legend by Arc descending so Completed leads. Colour the four failure states in warm tones and Completed in the accent colour — the eye should land on the failures.",
    pipeline: "[\n  { $group: { _id: \"$status\", bookings: { $sum: 1 } } },\n  { $setWindowFields: { output: { total: { $sum: \"$bookings\" } } } },\n  { $project: {\n      _id: 0, status: \"$_id\", bookings: 1,\n      share_pct: { $multiply: [{ $divide: [\"$bookings\", \"$total\"] }, 100] } } },\n  { $sort: { bookings: -1 } }\n]"
  },
  driver_reasons: {
    title: "Driver cancellation reasons",
    panel: "Why bookings are cancelled",
    chart: "Horizontal bar",
    encodings: [["Y axis","reason"],["X axis","count — Aggregate: sum"]],
    note: "Horizontal, not vertical: these labels are long sentences. Vertical bars would rotate them 90° and make the chart unreadable.",
    pipeline: "[\n  { $match: { \"cancellation.by\": \"driver\" } },\n  { $group: { _id: \"$cancellation.reason\", count: { $sum: 1 } } },\n  { $setWindowFields: { output: { total: { $sum: \"$count\" } } } },\n  { $project: {\n      _id: 0, reason: \"$_id\", count: 1,\n      share_pct: { $multiply: [{ $divide: [\"$count\", \"$total\"] }, 100] } } },\n  { $sort: { count: -1 } }\n]"
  },
  customer_reasons: {
    title: "Customer cancellation reasons",
    panel: "Why customers cancel",
    chart: "Horizontal bar",
    encodings: [["Y axis","reason"],["X axis","count — Aggregate: sum"]],
    note: "Put this beside the driver chart at the same X scale. The scale difference is the finding: 2,698 driver cancellations against 1,022 customer ones.",
    pipeline: "[\n  { $match: { \"cancellation.by\": \"customer\" } },\n  { $group: { _id: \"$cancellation.reason\", count: { $sum: 1 } } },\n  { $setWindowFields: { output: { total: { $sum: \"$count\" } } } },\n  { $project: {\n      _id: 0, reason: \"$_id\", count: 1,\n      share_pct: { $multiply: [{ $divide: [\"$count\", \"$total\"] }, 100] } } },\n  { $sort: { count: -1 } }\n]"
  },
  by_hour: {
    title: "Demand and failure by hour",
    panel: "Hourly booking volume and failure rate",
    chart: "Combo (column + line)",
    encodings: [["X axis","hour"],["Y axis (column)","bookings — sum"],["Y axis (line)","failure_rate_pct — mean, plotted on the right axis"]],
    note: "Two different units share one frame, so the line needs its own axis. In Atlas Charts: Customize → Series → failure_rate_pct → Axis → Right. Without this the percentage line flatlines against a 1,373-high bar scale.",
    pipeline: "[\n  { $group: {\n      _id:       { $toInt: { $substr: [\"$booked_at\", 11, 2] } },\n      bookings:  { $sum: 1 },\n      completed: { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, 1, 0] } },\n      revenue:   { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, \"$booking_value\", 0] } } } },\n  { $project: {\n      _id: 0, hour: \"$_id\", bookings: 1, completed: 1, revenue: 1,\n      failure_rate_pct: { $multiply: [\n        { $divide: [{ $subtract: [\"$bookings\", \"$completed\"] }, \"$bookings\"] }, 100] } } },\n  { $sort: { hour: 1 } }\n]"
  },
  by_month: {
    title: "The year in shape",
    panel: "Monthly bookings and revenue",
    chart: "Combo (column + line)",
    encodings: [["X axis","month"],["Y axis (column)","bookings — sum"],["Y axis (line)","revenue — sum, right axis"]],
    note: "month sorts correctly as a string because the format is YYYY-MM. That is the whole reason the generator stores it that way.",
    pipeline: "[\n  { $group: {\n      _id:       { $substr: [\"$date\", 0, 7] },\n      bookings:  { $sum: 1 },\n      completed: { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, 1, 0] } },\n      revenue:   { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, \"$booking_value\", 0] } } } },\n  { $project: { _id: 0, month: \"$_id\", bookings: 1, completed: 1, revenue: 1 } },\n  { $sort: { month: 1 } }\n]"
  },
  by_vehicle: {
    title: "Revenue by vehicle type",
    panel: "Revenue by vehicle type",
    chart: "Horizontal bar",
    encodings: [["Y axis","vehicle_type"],["X axis","revenue — sum"]],
    note: "Rank by revenue, not by booking count. Go Sedan takes more rides than Premier Sedan but earns less — ranking by volume would hide that.",
    pipeline: "[\n  { $group: {\n      _id:       \"$vehicle_type\",\n      bookings:  { $sum: 1 },\n      completed: { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, 1, 0] } },\n      revenue:   { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, \"$booking_value\", 0] } },\n      distance:  { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, \"$ride_distance\", 0] } } } },\n  { $project: {\n      _id: 0, vehicle_type: \"$_id\", bookings: 1, completed: 1, revenue: 1,\n      completion_rate_pct: { $multiply: [{ $divide: [\"$completed\", \"$bookings\"] }, 100] },\n      avg_booking_value:   { $divide: [\"$revenue\",  \"$completed\"] },\n      avg_distance_km:     { $divide: [\"$distance\", \"$completed\"] } } },\n  { $sort: { revenue: -1 } }\n]"
  },
  payment_methods: {
    title: "Payment method mix",
    panel: "Payment method mix",
    chart: "Donut",
    encodings: [["Label","method"],["Arc","bookings — sum"]],
    note: "The $match on payment_method is required, not cosmetic: failed bookings have no payment method at all, and without the filter Atlas renders a large unlabelled slice.",
    pipeline: "[\n  { $match: { payment_method: { $exists: true } } },\n  { $group: { _id: \"$payment_method\", bookings: { $sum: 1 } } },\n  { $setWindowFields: { output: { total: { $sum: \"$bookings\" } } } },\n  { $project: {\n      _id: 0, method: \"$_id\", bookings: 1,\n      share_pct: { $multiply: [{ $divide: [\"$bookings\", \"$total\"] }, 100] } } },\n  { $sort: { bookings: -1 } }\n]"
  },
  top_pickups: {
    title: "Top pickup points",
    panel: "Top pickup points by volume",
    chart: "Table (or horizontal bar on bookings)",
    encodings: [["Row","location"],["Columns","bookings, cancelled, cancellation_rate_pct, revenue"]],
    note: "cancelled counts rides that never moved — driver cancels, customer cancels, and no-driver-found. Incomplete rides are excluded because they did travel and did earn a fare.",
    pipeline: "[\n  { $group: {\n      _id:      \"$route.pickup\",\n      bookings: { $sum: 1 },\n      cancelled: { $sum: { $cond: [\n        { $in: [\"$status\", [\"Cancelled by Driver\", \"Cancelled by Customer\", \"No Driver Found\"]] },\n        1, 0] } },\n      revenue:  { $sum: { $ifNull: [\"$booking_value\", 0] } } } },\n  { $project: {\n      _id: 0, location: \"$_id\", bookings: 1, cancelled: 1, revenue: 1,\n      cancellation_rate_pct: { $multiply: [{ $divide: [\"$cancelled\", \"$bookings\"] }, 100] } } },\n  { $sort: { bookings: -1 } },\n  { $limit: 10 }\n]"
  },
  hourly_volume_floor: {
    title: "Worst failure rate among high-volume hours",
    panel: "The small-sample guard",
    chart: "Horizontal bar",
    encodings: [["Y axis","hour"],["X axis","failure_rate_pct — mean"]],
    note: "The $match comes AFTER the $project because failure_rate_pct does not exist until the $project creates it. This is the single most important pipeline on the page: without the volume floor the top result is 03:00 at 43.48% on 46 bookings.",
    pipeline: "[\n  { $group: {\n      _id:       { $toInt: { $substr: [\"$booked_at\", 11, 2] } },\n      bookings:  { $sum: 1 },\n      completed: { $sum: { $cond: [{ $eq: [\"$status\", \"Completed\"] }, 1, 0] } } } },\n  { $project: {\n      _id: 0, hour: \"$_id\", bookings: 1,\n      failure_rate_pct: { $multiply: [\n        { $divide: [{ $subtract: [\"$bookings\", \"$completed\"] }, \"$bookings\"] }, 100] } } },\n  { $match: { bookings: { $gte: 1000 } } },\n  { $sort: { failure_rate_pct: -1 } }\n]"
  },
};
