import re

with open('function/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the PMH list manager
pmh_start = content.find("setupListManager('cf4PmhTemplateList'")
print('PMH start at:', pmh_start)

if pmh_start != -1:
    # Find the first marker
    marker = "'HISTORY OF RECURRENT SINUSITIS'"
    first_marker_idx = content.find(marker, pmh_start)
    print('First marker at:', first_marker_idx)
    
    # Find the closing bracket after the first marker
    close_idx = content.find("]);", first_marker_idx)
    print('First close at:', close_idx)
    
    # Find the second marker (inside the orphaned block)
    second_marker_idx = content.find(marker, first_marker_idx + 1)
    print('Second marker at:', second_marker_idx)
    
    # Find the legitimate closing after the second marker
    close2_idx = content.find("]);", second_marker_idx)
    print('Second close at:', close2_idx)
    
    # Remove everything from after the first close to the second close
    new_content = content[:close_idx + 3] + content[close2_idx + 3:]
    
    with open('function/index.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Removed orphaned block successfully!')
else:
    print('PMH list manager not found!')