#!/bin/bash

# Target mean volume in dB
TARGET_MEAN_DB=-13.0

# Function to get mean volume of an audio file
get_mean_volume() {
    local file="$1"
    ffmpeg -nostdin -i "$file" -filter:a volumedetect -f null /dev/null 2>&1 |
        grep "mean_volume" |
        sed -E 's/.*mean_volume: ([-0-9.]+) dB/\1/'
}

# Create temporary file for summary
summary_file=$(mktemp)
trap 'rm -f "$summary_file"' EXIT

# Process each MP3 file in the sounds directory
while IFS= read -r file; do
    echo "Processing: $file"

    # Get current mean volume
    current_mean=$(get_mean_volume "$file")

    # Calculate required gain
    gain=$(echo "$TARGET_MEAN_DB - $current_mean" | bc)

    echo "  Current mean volume: ${current_mean} dB"
    echo "  Required gain: ${gain} dB"

    # Only normalize if gain adjustment is more than 0.5 dB (to avoid unnecessary processing)
    if (($(echo "sqrt(($gain)^2) > 0.5" | bc -l))); then
        echo "  Normalizing..."
        temp_file="${file%.mp3}-normalized.mp3"
        ffmpeg -nostdin -i "$file" -filter:a "volume=${gain}dB" -c:a libmp3lame -q:a 2 "$temp_file" -y
        mv "$temp_file" "$file"
        new_mean=$(get_mean_volume "$file")
        echo "  New mean volume: ${new_mean} dB"
        echo "$file: ${new_mean} dB [was ${current_mean} dB]" >>"$summary_file"
    else
        echo "  Volume is within acceptable range, skipping"
        echo "$file: ${current_mean} dB" >>"$summary_file"
    fi
    echo
done < <(find sounds -name "*.mp3" | sort)

# Print summary
echo "=== Summary of Audio Files ==="
sort "$summary_file"
echo "=========================="
