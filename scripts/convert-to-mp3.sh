#!/bin/bash

# Create temporary file for summary
summary_file=$(mktemp)
trap 'rm -f "$summary_file"' EXIT

# Process each WAV/AIFF file in the sounds directory
while IFS= read -r audio_file; do
    echo "Processing: $audio_file"

    # Create the equivalent mp3 path (handles both .wav and .aiff extensions)
    mp3_file="${audio_file%.*}.mp3"

    # Check if MP3 already exists
    if [[ -f "$mp3_file" ]]; then
        echo "  Skipping: MP3 version already exists"
        echo "$audio_file -> $mp3_file (skipped - already exists)" >>"$summary_file"
        continue
    fi

    # Convert to MP3 using high quality settings
    echo "  Converting to MP3..."
    ffmpeg -nostdin -i "$audio_file" -codec:a libmp3lame -qscale:a 2 "$mp3_file" -y

    if [[ -f "$mp3_file" ]]; then
        echo "  Success: Created $mp3_file"
        echo "$audio_file -> $mp3_file (converted)" >>"$summary_file"
    else
        echo "  Error: Failed to create $mp3_file"
        echo "$audio_file -> $mp3_file (failed)" >>"$summary_file"
    fi
    echo
done < <(find sounds -type f \( -name "*.wav" -o -name "*.aiff" \) | sort)

# Print summary
echo "=== Summary of Audio to MP3 Conversions ==="
sort "$summary_file"
echo "======================================"
