import argparse
import os
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("tag", "dtag"))
    args = parser.parse_args()
    tag = os.environ.get("RELEASE_TAG", "")
    if not tag.startswith("v") or len(tag) == 1:
        parser.error("Version must be a valid Git tag starting with v")
    subprocess.run(["git", "check-ref-format", f"refs/tags/{tag}"], check=True)

    operation = "create and push" if args.operation == "tag" else "delete and push"
    reply = input(f"Are you sure to {operation} tag {tag}? [y/N] ")
    if reply not in ("y", "Y"):
        print("Operation cancelled")
        return

    if args.operation == "tag":
        subprocess.run(["git", "tag", tag], check=True)
        subprocess.run(["git", "push", "origin", f"refs/tags/{tag}"], check=True)
    else:
        subprocess.run(["git", "tag", "-d", tag], check=True)
        subprocess.run(["git", "push", "origin", "--delete", f"refs/tags/{tag}"], check=True)


if __name__ == "__main__":
    main()
