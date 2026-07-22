#!/usr/bin/env python3
"""
Patch Mach-O binary after dylib injection.
Updates LC_ENCRYPTION_INFO_64 cryptoff to account for shifted load commands.
"""
import struct
import sys
import shutil
import os

def get_load_cmd_shift(original_path, patched_path):
    with open(original_path, 'rb') as f:
        orig = f.read()
    with open(patched_path, 'rb') as f:
        patched = f.read()

    orig_sizeofcmds = struct.unpack_from('<I', orig, 20)[0]
    new_sizeofcmds = struct.unpack_from('<I', patched, 20)[0]
    shift = new_sizeofcmds - orig_sizeofcmds
    print(f"Load commands shift: {shift} bytes (orig: {orig_sizeofcmds}, new: {new_sizeofcmds})")
    return shift

def patch_cryptoff(filepath, shift):
    with open(filepath, 'rb') as f:
        data = bytearray(f.read())

    magic = struct.unpack_from('<I', data, 0)[0]
    ncmds = struct.unpack_from('<I', data, 16)[0]

    if magic == 0xFEEDFACF:
        header_size = 0x20
    elif magic == 0xFEEDFACE:
        header_size = 0x1C
    else:
        print(f"Unknown magic: {hex(magic)}")
        return

    offset = header_size
    patched = False

    for i in range(ncmds):
        if offset + 8 > len(data):
            break
        cmd = struct.unpack_from('<I', data, offset)[0]
        cmdsize = struct.unpack_from('<I', data, offset + 4)[0]
        if cmdsize == 0:
            break

        if cmd == 0x21:  # LC_ENCRYPTION_INFO_64
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            print(f"  Found LC_ENCRYPTION_INFO_64 at {hex(offset)}")
            print(f"  Before: cryptoff={hex(cryptoff)}, cryptid={cryptid}")

            if shift > 0:
                new_cryptoff = cryptoff + shift
                struct.pack_into('<I', data, offset + 8, new_cryptoff)
                print(f"  After:  cryptoff={hex(new_cryptoff)}")
                patched = True

        offset += cmdsize

    if patched:
        with open(filepath, 'wb') as f:
            f.write(data)
        print(f"  Patched {os.path.basename(filepath)}")
    else:
        print(f"  No encryption info found in {os.path.basename(filepath)}")

def check_encryption(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()

    magic = struct.unpack_from('<I', data, 0)[0]
    if magic == 0xFEEDFACF:
        header_size = 0x20
    elif magic == 0xFEEDFACE:
        header_size = 0x1C
    else:
        print(f"Not a Mach-O: {hex(magic)}")
        return False

    ncmds = struct.unpack_from('<I', data, 16)[0]
    offset = header_size

    for i in range(ncmds):
        if offset + 8 > len(data):
            break
        cmd = struct.unpack_from('<I', data, offset)[0]
        cmdsize = struct.unpack_from('<I', data, offset + 4)[0]
        if cmdsize == 0:
            break

        if cmd == 0x21:
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptsize = struct.unpack_from('<I', data, offset + 12)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            print(f"  LC_ENCRYPTION_INFO_64: cryptoff={hex(cryptoff)}, cryptsize={cryptsize}, cryptid={cryptid}")
            return cryptid == 1

        offset += cmdsize

    print("  No LC_ENCRYPTION_INFO_64 found")
    return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: patch_macho.py <command> [args]")
        print("  check <binary>           - Check if binary is encrypted")
        print("  patch <orig> <patched>   - Patch cryptoff after injection")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'check':
        result = check_encryption(sys.argv[2])
        print(f"Encrypted: {result}")
        sys.exit(0 if not result else 1)

    elif cmd == 'patch':
        orig = sys.argv[2]
        patched = sys.argv[3]
        shift = get_load_cmd_shift(orig, patched)
        if shift > 0:
            patch_cryptoff(patched, shift)
        else:
            print("No shift, no patching needed")

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
