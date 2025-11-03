#!/bin/sh

echo "Injecting runtime environment variables into index.html..."

CONFIG_BLOCK=$(cat << EOF
    <script id="twenty-env-config">
      window._env_ = {
        REACT_APP_SERVER_BASE_URL: "$REACT_APP_SERVER_BASE_URL"
      };
    </script>
    <!-- END: NodiaFlow Config -->
EOF
)
# Use sed to replace the config block in index.html
# Using pattern space to match across multiple lines
echo "$CONFIG_BLOCK" | sed -i.bak '
  /<!-- BEGIN: NodiaFlow Config -->/,/<!-- END: NodiaFlow Config -->/{
    /<!-- BEGIN: NodiaFlow Config -->/!{
      /<!-- END: NodiaFlow Config -->/!d
    }
    /<!-- BEGIN: NodiaFlow Config -->/r /dev/stdin
    /<!-- END: NodiaFlow Config -->/d
  }
' build/index.html
rm -f build/index.html.bak
