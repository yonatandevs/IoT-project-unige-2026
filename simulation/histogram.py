import streamlit as st
import pandas as pd
import plotly.express as px

st.set_page_config(layout="wide")

# ----------------------------
# Load data
# ----------------------------
@st.cache_data
def load_data():
    df = pd.read_json("bike-ge-001.jsonl", lines=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")
    return df

df = load_data()

st.title("🚲 Bike IoT Dashboard (Clean Ride + Geo Fix)")

if df.empty:
    st.error("No data found")
    st.stop()

# ----------------------------
# Bike selector
# ----------------------------
bike = st.selectbox("Select bike", df["bikeId"].unique())
d = df[df["bikeId"] == bike].copy()

# ----------------------------
# Ride segmentation (IMPORTANT)
# ----------------------------
d = d.sort_values("timestamp")

d["gap_seconds"] = d["timestamp"].diff().dt.total_seconds().fillna(0)
d["ride_id"] = (d["gap_seconds"] > 300).cumsum()
d["ride_id_str"] = d["ride_id"].astype(int).astype(str)

# ----------------------------
# Mark start / end / waypoint
# ----------------------------
d["point_type"] = "waypoint"
d.loc[d.groupby("ride_id").head(1).index, "point_type"] = "start"
d.loc[d.groupby("ride_id").tail(1).index, "point_type"] = "end"

# ----------------------------
# IMPORTANT: ensure correct geo columns
# ----------------------------
# your data is already correct: lat = latitude, lng = longitude
# but we enforce naming clarity for plots

d["lat_plot"] = d["lat"]
d["lon_plot"] = d["lng"]

# ----------------------------
# Downsample for performance (VERY IMPORTANT)
# ----------------------------
d = d.groupby("ride_id").apply(lambda x: x.iloc[::5]).reset_index(drop=True)

# ----------------------------
# LAYOUT
# ----------------------------
col1, col2 = st.columns(2)

# ----------------------------
# MAP
# ----------------------------
with col1:
    st.subheader("🗺️ Bike Routes (colored per ride)")

    fig = px.scatter_mapbox(
        d,
        lat="lat_plot",
        lon="lon_plot",
        color="ride_id_str",
        hover_data=["speed", "battery", "timestamp", "point_type"],
        zoom=12,
        height=650,
    )

    fig.update_layout(mapbox_style="open-street-map")

    st.plotly_chart(fig, use_container_width=True)

# ----------------------------
# BATTERY
# ----------------------------
with col2:
    st.subheader("🔋 Battery over time")

    st.line_chart(
        d.set_index("timestamp")["battery"]
    )

# ----------------------------
# SPEED
# ----------------------------
st.subheader("🚲 Speed over time")

st.line_chart(
    d.set_index("timestamp")["speed"]
)

# ----------------------------
# RIDE SUMMARY
# ----------------------------
st.subheader("📊 Ride Summary")

summary = d.groupby("ride_id").agg(
    points=("speed", "count"),
    avg_speed=("speed", "mean"),
    min_battery=("battery", "min"),
    start_time=("timestamp", "min"),
    end_time=("timestamp", "max"),
).reset_index()

st.dataframe(summary)