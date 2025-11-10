# Test Nushell script for nu-lint extension

def greet [name: string] {
  print $"Hello ($name)!"
}

# This might trigger some linting rules
def bad-function [] {
  let x = 5
  echo $x # prefer print over echo
}
 
# Function that could use pipeline input
def filter-positive [data] {
  $data | where $it > 0
} 

greet "World"
