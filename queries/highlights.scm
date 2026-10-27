(section_name) @type ; consistency with toml
(comment) @comment
(key) @property
(value) @string
(attachment_data) @string
(text) @string
(tag_string) @string
(timestamp) @number
(integer) @number
(number) @number
(color) @constant
(override_color) @constant
(tag_name) @function.builtin
"drawing_command_name" @function.builtin
(escape_sequence) @string.escape
(override_comment) @comment
(ERROR) @error
[
  "["
  "]"
  "{"
  "}"
  "("
  ")"
] @punctuation.bracket
"," @punctuation.delimiter
":" @operator

; Column fields repeat every six values, including empty values.
; Higher priority keeps scalar children from replacing the column palette.
((section (section_header [section_name_styles: (_) section_name_events: (_)])
  (key_value_pair values_format: (values column_1: (value) @ass.column.1))) (#set! priority 110))
((section (section_header [section_name_styles: (_) section_name_events: (_)])
  (key_value_pair values_format: (values column_2: (value) @ass.column.2))) (#set! priority 110))
((section (section_header [section_name_styles: (_) section_name_events: (_)])
  (key_value_pair values_format: (values column_3: (value) @ass.column.3))) (#set! priority 110))
((section (section_header [section_name_styles: (_) section_name_events: (_)])
  (key_value_pair values_format: (values column_4: (value) @ass.column.4))) (#set! priority 110))
((section (section_header [section_name_styles: (_) section_name_events: (_)])
  (key_value_pair values_format: (values column_5: (value) @ass.column.5))) (#set! priority 110))
((section (section_header [section_name_styles: (_) section_name_events: (_)])
  (key_value_pair values_format: (values column_6: (value) @ass.column.6))) (#set! priority 110))

((section (section_header section_name_styles: (_))
  (key_value_pair values_style: (values column_1: (value) @ass.column.1))) (#set! priority 110))
((section (section_header section_name_styles: (_))
  (key_value_pair values_style: (values column_2: (value) @ass.column.2))) (#set! priority 110))
((section (section_header section_name_styles: (_))
  (key_value_pair values_style: (values column_3: (value) @ass.column.3))) (#set! priority 110))
((section (section_header section_name_styles: (_))
  (key_value_pair values_style: (values column_4: (value) @ass.column.4))) (#set! priority 110))
((section (section_header section_name_styles: (_))
  (key_value_pair values_style: (values column_5: (value) @ass.column.5))) (#set! priority 110))
((section (section_header section_name_styles: (_))
  (key_value_pair values_style: (values column_6: (value) @ass.column.6))) (#set! priority 110))

; The final event value is Text. Its commas and nested syntax are not columns.
((section (section_header section_name_events: (_)) (key_value_pair
  [key_dialogue: (key) key_picture: (key) key_sound: (key) key_movie: (key) key_command: (key)]
  (values column_1: (value) @ass.column.1 . (value)))) (#set! priority 110))
((section (section_header section_name_events: (_)) (key_value_pair
  [key_dialogue: (key) key_picture: (key) key_sound: (key) key_movie: (key) key_command: (key)]
  (values column_2: (value) @ass.column.2 . (value)))) (#set! priority 110))
((section (section_header section_name_events: (_)) (key_value_pair
  [key_dialogue: (key) key_picture: (key) key_sound: (key) key_movie: (key) key_command: (key)]
  (values column_3: (value) @ass.column.3 . (value)))) (#set! priority 110))
((section (section_header section_name_events: (_)) (key_value_pair
  [key_dialogue: (key) key_picture: (key) key_sound: (key) key_movie: (key) key_command: (key)]
  (values column_4: (value) @ass.column.4 . (value)))) (#set! priority 110))
((section (section_header section_name_events: (_)) (key_value_pair
  [key_dialogue: (key) key_picture: (key) key_sound: (key) key_movie: (key) key_command: (key)]
  (values column_5: (value) @ass.column.5 . (value)))) (#set! priority 110))
((section (section_header section_name_events: (_)) (key_value_pair
  [key_dialogue: (key) key_picture: (key) key_sound: (key) key_movie: (key) key_command: (key)]
  (values column_6: (value) @ass.column.6 . (value)))) (#set! priority 110))

; Disabled dialogue and karaoke templates remain comments throughout.
((section (section_header section_name_events: (_))
  (key_value_pair key_comment: (key)) @comment) (#set! priority 120))
