//go:build windows

package main

func reuseAddrControl(fd uintptr) {
	// SO_REUSEADDR è già il default su Windows
}